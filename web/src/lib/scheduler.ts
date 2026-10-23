import type {
  CookStep,
  KitchenPreset,
  Recipe,
  Schedule,
  ScheduleStep,
  Substitution,
} from '../types'

// Offline TypeScript scheduler — a heuristic port of tools/scheduler.py (which
// uses OR-Tools CP-SAT). It interleaves ONE cook's work across several recipes
// (start the salad while the soup simmers), respecting step precedence, tool
// capacities, and the human "cook" as a capacity-1 resource consumed only by
// active steps. Not provably optimal; the parity harness (scripts/check_parity)
// compares makespan against the Python scheduler to keep it honest.

const COOK_RESOURCE = 'cook'
// Stateful tools (the oven, scheduler.py _STATEFUL_TOOLS): one recipe owns the
// tool continuously from its first to its last use of it, so another recipe
// can't preheat to a different temperature in the gap. Modeled as a per-recipe
// "session" span that can't overlap another recipe's session for that tool.
const STATEFUL_TOOLS = new Set(['oven'])

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

export class UnsupportedToolError extends Error {}

// A step after id-namespacing and substitution resolution.
interface RStep {
  id: string // globally unique: `${recipeIndex}:${step.id}`
  recipe: string
  description: string
  duration_min: number
  active: boolean
  tools: string[]
  depends_on: string[]
  ingredients: string[]
}

interface Interval {
  start: number
  end: number
}

// ---- substitution resolution (ports resolve_tools) ----

function findSubstitute(tool: string, kitchen: KitchenPreset) {
  for (const rule of kitchen.substitutions[tool] ?? []) {
    if (rule.tool === null || (kitchen.inventory[rule.tool] ?? 0) > 0) return rule
  }
  return null
}

function resolveTools(
  steps: RStep[],
  kitchen: KitchenPreset,
): { resolved: RStep[]; substitutions: Substitution[] } {
  const resolved: RStep[] = []
  const substitutions: Substitution[] = []

  for (const s of steps) {
    const newTools: string[] = []
    let timeMult = 1.0
    for (const tool of s.tools) {
      if (tool === COOK_RESOURCE) continue
      if ((kitchen.inventory[tool] ?? 0) > 0) {
        newTools.push(tool)
        continue
      }
      const rule = findSubstitute(tool, kitchen)
      if (rule === null) {
        throw new UnsupportedToolError(
          `${s.recipe} step ${s.id} needs "${tool}", which is not in the kitchen and has no substitute.`,
        )
      }
      if (rule.tool !== null) newTools.push(rule.tool)
      timeMult *= rule.time_multiplier
      substitutions.push({
        recipe: s.recipe,
        step_id: s.id,
        original_tool: tool,
        substitute_tool: rule.tool,
        time_multiplier: rule.time_multiplier,
        note: rule.note,
      })
    }
    const duration = Math.max(1, Math.round(s.duration_min * timeMult))
    resolved.push({ ...s, tools: newTools, duration_min: duration })
  }
  return { resolved, substitutions }
}

// ---- resource timeline ----

// Max number of reservations covering any point of [start, end).
function maxOverlap(reservations: Interval[], start: number, end: number): number {
  const points: { t: number; d: number }[] = []
  for (const r of reservations) {
    if (r.end <= start || r.start >= end) continue
    points.push({ t: Math.max(r.start, start), d: 1 })
    points.push({ t: Math.min(r.end, end), d: -1 })
  }
  points.sort((a, b) => a.t - b.t || a.d - b.d)
  let cur = 0
  let max = 0
  for (const p of points) {
    cur += p.d
    if (cur > max) max = cur
  }
  return max
}

// ---- list scheduler ----

export function scheduleRecipes(
  recipes: Recipe[],
  kitchen: KitchenPreset,
  numCooks = 1,
): Schedule {
  // Namespace step ids per recipe and remap depends_on.
  const steps: RStep[] = []
  recipes.forEach((recipe, i) => {
    for (const s of recipe.cookSteps) {
      steps.push({
        id: `${i}:${s.id}`,
        recipe: recipe.name,
        description: s.description,
        duration_min: s.duration_min,
        active: s.active,
        tools: s.tools,
        depends_on: s.depends_on.map((d) => `${i}:${d}`),
        ingredients: (s as CookStep).ingredients ?? [],
      })
    }
  })

  const { resolved, substitutions } = resolveTools(steps, kitchen)

  const byId = new Map(resolved.map((s) => [s.id, s]))
  const capacity = (res: string) =>
    res === COOK_RESOURCE ? numCooks : kitchen.inventory[res] ?? 0

  // Critical-path tail: longest duration from this step to a sink. Used as a
  // priority tiebreak so work on the longest remaining chain starts first.
  const tail = new Map<string, number>()
  const successors = new Map<string, string[]>()
  for (const s of resolved) {
    for (const d of s.depends_on) {
      if (byId.has(d)) (successors.get(d) ?? successors.set(d, []).get(d)!).push(s.id)
    }
  }
  const computeTail = (id: string): number => {
    const cached = tail.get(id)
    if (cached !== undefined) return cached
    const s = byId.get(id)!
    let t = s.duration_min
    for (const suc of successors.get(id) ?? []) t = Math.max(t, s.duration_min + computeTail(suc))
    tail.set(id, t)
    return t
  }
  for (const s of resolved) computeTail(s.id)

  // Resources each step reserves: its tools + the cook (active steps only).
  const resourcesOf = (s: RStep) => (s.active ? [...s.tools, COOK_RESOURCE] : s.tools)

  const reservations = new Map<string, Interval[]>()
  const placed = new Map<string, Interval>()

  // Stateful-tool sessions: one recipe "owns" the tool from its first to last
  // use. sessionRemaining tracks how many of a recipe's steps still need the
  // tool; sessionOwner is the recipe mid-session; freeAfter is when the tool
  // last came free (so a new owner can't slot into a past gap).
  const sessionRemaining = new Map<string, number>() // `${tool}|${recipe}` -> count
  const sessionOwner = new Map<string, string | null>() // tool -> recipe
  const freeAfter = new Map<string, number>() // tool -> time
  for (const s of resolved) {
    for (const tool of s.tools) {
      if (!STATEFUL_TOOLS.has(tool)) continue
      const key = `${tool}|${s.recipe}`
      sessionRemaining.set(key, (sessionRemaining.get(key) ?? 0) + 1)
    }
  }

  // Earliest feasible start, or null if the step can't be placed right now
  // (another recipe owns a stateful tool it needs — defer and retry later).
  const earliestFeasibleStart = (s: RStep): number | null => {
    let lb = 0
    for (const dep of s.depends_on) {
      const p = placed.get(dep)
      if (p) lb = Math.max(lb, p.end)
    }
    for (const tool of s.tools) {
      if (!STATEFUL_TOOLS.has(tool)) continue
      const owner = sessionOwner.get(tool) ?? null
      if (owner !== null && owner !== s.recipe) return null // tool busy with another recipe
      if (owner === null) lb = Math.max(lb, freeAfter.get(tool) ?? 0) // opening a new session
    }
    const res = resourcesOf(s)
    const candidates = new Set<number>([lb])
    for (const r of res) {
      for (const iv of reservations.get(r) ?? []) if (iv.end > lb) candidates.add(iv.end)
    }
    for (const t of [...candidates].sort((a, b) => a - b)) {
      const end = t + s.duration_min
      const ok = res.every((r) => {
        const cap = capacity(r)
        if (cap <= 0) return false
        return maxOverlap(reservations.get(r) ?? [], t, end) + 1 <= cap
      })
      if (ok) return t
    }
    return lb
  }

  const scheduledIds = new Set<string>()
  const ready = () =>
    resolved.filter(
      (s) => !scheduledIds.has(s.id) && s.depends_on.every((d) => !byId.has(d) || scheduledIds.has(d)),
    )

  // Parallel schedule generation: place the ready, placeable step with the
  // earliest feasible start (ties: passive first — frees cook/oven sooner —
  // then longest critical-path tail, then longer duration).
  while (scheduledIds.size < resolved.length) {
    const cands = ready()
    if (cands.length === 0) break // dependency cycle / dangling — stop safely
    let best: RStep | null = null
    let bestStart = Infinity
    for (const s of cands) {
      const start = earliestFeasibleStart(s)
      if (start === null) continue
      const better =
        best === null ||
        start < bestStart ||
        (start === bestStart &&
          ((!s.active && best.active) ||
            (s.active === best.active &&
              (computeTail(s.id) > computeTail(best.id) ||
                (computeTail(s.id) === computeTail(best.id) &&
                  s.duration_min > best.duration_min)))))
      if (better) {
        best = s
        bestStart = start
      }
    }
    // Safety valve: if every ready step is session-blocked, place the earliest
    // by lb ignoring the lock (shouldn't happen for acyclic single-cook meals).
    if (!best) {
      best = cands.reduce((a, b) => (earliestFeasibleStart0(a) <= earliestFeasibleStart0(b) ? a : b))
      bestStart = earliestFeasibleStart0(best)
    }
    const iv = { start: bestStart, end: bestStart + best.duration_min }
    placed.set(best.id, iv)
    for (const r of resourcesOf(best)) {
      const list = reservations.get(r) ?? []
      list.push(iv)
      reservations.set(r, list)
    }
    for (const tool of best.tools) {
      if (!STATEFUL_TOOLS.has(tool)) continue
      sessionOwner.set(tool, best.recipe)
      const key = `${tool}|${best.recipe}`
      const rem = (sessionRemaining.get(key) ?? 1) - 1
      sessionRemaining.set(key, rem)
      if (rem <= 0) {
        sessionOwner.set(tool, null) // session complete; tool free after this step
        freeAfter.set(tool, Math.max(freeAfter.get(tool) ?? 0, iv.end))
      }
    }
    scheduledIds.add(best.id)
  }

  // lb-only start (ignores locks), for the safety valve above.
  function earliestFeasibleStart0(s: RStep): number {
    let lb = 0
    for (const dep of s.depends_on) {
      const p = placed.get(dep)
      if (p) lb = Math.max(lb, p.end)
    }
    return lb
  }

  const icons: Record<string, string> = {}
  for (const r of recipes) icons[r.name] = r.icon ?? '🍽️'

  const steps_out: ScheduleStep[] = resolved
    .map((s) => {
      const iv = placed.get(s.id) ?? { start: 0, end: s.duration_min }
      return {
        step_id: s.id,
        recipe: s.recipe,
        description: s.description,
        duration_min: s.duration_min,
        active: s.active,
        tools: s.tools,
        depends_on: s.depends_on,
        ingredients: s.ingredients,
        start_min: iv.start,
        end_min: iv.end,
        start_clock: formatClock(iv.start),
        end_clock: formatClock(iv.end),
        cook_id: s.active ? 0 : null,
      }
    })
    // Order by start; among ties, passive first (so "preheat the oven" leads
    // the concurrent active work), then by recipe/id for stability.
    .sort(
      (a, b) =>
        a.start_min - b.start_min ||
        Number(a.active) - Number(b.active) ||
        a.recipe.localeCompare(b.recipe) ||
        a.step_id.localeCompare(b.step_id),
    )

  const makespan = steps_out.reduce((m, s) => Math.max(m, s.end_min), 0)

  return {
    makespan_min: makespan,
    makespan_label: formatDuration(makespan),
    substitutions,
    steps: steps_out,
    icons,
    num_cooks: numCooks,
  }
}

// ---- feasibility validator (used by the parity harness + tests) ----

export function validateSchedule(schedule: Schedule, kitchen: KitchenPreset, numCooks = 1): string[] {
  const problems: string[] = []
  const byId = new Map(schedule.steps.map((s) => [s.step_id, s]))

  // Precedence.
  for (const s of schedule.steps) {
    for (const dep of s.depends_on) {
      const p = byId.get(dep)
      if (p && s.start_min < p.end_min) {
        problems.push(`${s.step_id} starts before dep ${dep} ends`)
      }
    }
  }

  // Resource capacity (tools + cook).
  const byResource = new Map<string, Interval[]>()
  for (const s of schedule.steps) {
    const res = s.active ? [...s.tools, COOK_RESOURCE] : s.tools
    for (const r of res) {
      const list = byResource.get(r) ?? []
      list.push({ start: s.start_min, end: s.end_min })
      byResource.set(r, list)
    }
  }
  for (const [r, ivs] of byResource) {
    const cap = r === COOK_RESOURCE ? numCooks : kitchen.inventory[r] ?? 0
    // Sweep for max concurrency.
    const pts = ivs.flatMap((iv) => [
      { t: iv.start, d: 1 },
      { t: iv.end, d: -1 },
    ])
    pts.sort((a, b) => a.t - b.t || a.d - b.d)
    let cur = 0
    for (const p of pts) {
      cur += p.d
      if (cur > cap) {
        problems.push(`resource "${r}" over capacity (${cur} > ${cap}) at t=${p.t}`)
        break
      }
    }
  }

  // Stateful-tool sessions must not overlap across recipes.
  for (const tool of STATEFUL_TOOLS) {
    const spans = new Map<string, Interval>()
    for (const s of schedule.steps) {
      if (!s.tools.includes(tool)) continue
      const cur = spans.get(s.recipe)
      spans.set(s.recipe, cur
        ? { start: Math.min(cur.start, s.start_min), end: Math.max(cur.end, s.end_min) }
        : { start: s.start_min, end: s.end_min })
    }
    const list = [...spans.entries()]
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i][1], list[j][1])) {
          problems.push(`${tool} session overlap: ${list[i][0]} vs ${list[j][0]}`)
        }
      }
    }
  }
  return problems
}

// ---- formatting (match scheduler.py) ----

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}
