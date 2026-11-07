import type { CookStep, KitchenPreset, Recipe, Schedule } from '../types'
import { scheduleRecipes, type ScheduleOptions } from './scheduler.ts'
import { getKitchen } from './kitchens.ts'

// Recipe "total time" conventions leave out cooling at the end ("1 hour, plus
// cooling") and long waits like an overnight soak or chill. Octocook's plans
// include every step, so the headline time here is the plan with those waits
// collapsed to zero, and the waits are reported next to it ("+1h cooling").
// The schedule itself is unchanged.

// Cooling: a passive cool/chill/set step (10+ min) after which only cooling or
// a short, heat-free finish (cut, frost, unmold) remains.
// Ahead: other long (4h+ or overnight) waits that aren't cooking, and
// soaking/pressing/marinating that starts a recipe.
// Shorter waits ("cool slightly before serving") stay in the headline.
const COOL_RE = /\b(cool|chill|refrigerat|fridge|freez|set\b|firm)/i
const CHILL_RE = /\b(chill|refrigerat|fridge|freez)/i
const AHEAD_RE = /\b(soak|press(ed|ing)?\b|marinat)/i
const OVERNIGHT_RE = /\bovernight\b/i
const LONG_WAIT_MIN = 240
const MIN_WAIT_MIN = 10
const FINISH_MAX_MIN = 10
const HEAT_TOOLS = new Set(['oven', 'stove_burner'])
const HEAT_RE = /\b(bake|roast|cook|simmer|boil|fry|toast)/i

export type WaitKind = 'cooling' | 'ahead'

export function waitKinds(steps: CookStep[]): Map<string, WaitKind> {
  const succ = new Map<string, CookStep[]>()
  for (const s of steps) {
    for (const d of s.depends_on) (succ.get(d) ?? succ.set(d, []).get(d)!).push(s)
  }
  const kinds = new Map<string, WaitKind>()
  const heated = (s: CookStep) => HEAT_RE.test(s.description) || s.tools.some((t) => HEAT_TOOLS.has(t))
  const longWait = (s: CookStep) => s.duration_min >= LONG_WAIT_MIN || OVERNIGHT_RE.test(s.description)
  const isFinish = (s: CookStep) =>
    s.active && s.duration_min <= FINISH_MAX_MIN && !s.tools.some((t) => HEAT_TOOLS.has(t))

  // Cooling, from the sinks backwards: a cool step counts when everything
  // downstream is cooling or finishing (the finish steps themselves still count).
  const tailMemo = new Map<string, boolean>()
  const onlyTailAfter = (s: CookStep): boolean => {
    const cached = tailMemo.get(s.id)
    if (cached !== undefined) return cached
    tailMemo.set(s.id, false) // cycle guard
    const ok = (succ.get(s.id) ?? []).every(
      (n) => (isCooling(n) || isFinish(n)) && onlyTailAfter(n),
    )
    tailMemo.set(s.id, ok)
    return ok
  }
  const isCooling = (s: CookStep): boolean =>
    !s.active && COOL_RE.test(s.description) && !heated(s) && onlyTailAfter(s)

  for (const s of steps) {
    if (s.active || s.duration_min < MIN_WAIT_MIN || heated(s)) continue
    if (isCooling(s)) kinds.set(s.id, 'cooling')
    else if (longWait(s) || (s.depends_on.length === 0 && AHEAD_RE.test(s.description))) kinds.set(s.id, 'ahead')
  }
  return kinds
}

export interface TimeSplit {
  readyMin: number // the recipe-style total: everything but the waits below
  coolingMin: number
  aheadMin: number
  coolingWord: 'cooling' | 'chilling'
}

// `planMin(zero)` is the plan length with the steps in `zero` taking no time.
function split(
  totalMin: number,
  kinds: { key: string; kind: WaitKind; description: string }[],
  planMin: (zero: Set<string>) => number,
): TimeSplit {
  const cooling = new Set(kinds.filter((k) => k.kind === 'cooling').map((k) => k.key))
  const ahead = new Set(kinds.filter((k) => k.kind === 'ahead').map((k) => k.key))
  const chill = kinds.some((k) => k.kind === 'cooling' && CHILL_RE.test(k.description))
  const word = chill ? 'chilling' : 'cooling'
  if (!kinds.length) return { readyMin: totalMin, coolingMin: 0, aheadMin: 0, coolingWord: word }
  const both = new Set([...cooling, ...ahead])
  const ready = Math.min(totalMin, planMin(both))
  const withCooling = Math.min(totalMin, Math.max(ready, ahead.size ? planMin(ahead) : totalMin))
  return {
    readyMin: ready,
    coolingMin: withCooling - ready,
    aheadMin: totalMin - withCooling,
    coolingWord: word,
  }
}

function zeroed(recipe: Recipe, zero: Set<string>, prefix: string): Recipe {
  return {
    ...recipe,
    cookSteps: recipe.cookSteps.map((s) =>
      zero.has(prefix + s.id) ? { ...s, duration_min: 0 } : s,
    ),
  }
}

// Longest dependency chain — the fallback when a recipe can't be scheduled in
// the default kitchen (a tool with no substitute).
function criticalPath(steps: CookStep[]): number {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const memo = new Map<string, number>()
  const finish = (s: CookStep): number => {
    const cached = memo.get(s.id)
    if (cached !== undefined) return cached
    memo.set(s.id, 0) // cycle guard
    const start = Math.max(0, ...s.depends_on.map((d) => byId.get(d)).filter((d) => !!d).map((d) => finish(d!)))
    const end = start + Math.max(0, s.duration_min)
    memo.set(s.id, end)
    return end
  }
  return Math.max(0, ...steps.map(finish))
}

// One recipe on its own, as the single-recipe viewer shows it: one cook in the
// default kitchen.
export function recipeTime(steps: CookStep[]): { totalMin: number; split: TimeSplit } {
  const plan = (s: CookStep[]): number => {
    try {
      return scheduleRecipes([{ name: 'recipe', cookSteps: s }], getKitchen('default'), 1).makespan_min
    } catch {
      return criticalPath(s)
    }
  }
  const total = plan(steps)
  const kinds = waitKinds(steps)
  const list = steps.filter((s) => kinds.has(s.id)).map((s) => ({ key: s.id, kind: kinds.get(s.id)!, description: s.description }))
  const recipe: Recipe = { name: 'recipe', cookSteps: steps }
  return { totalMin: total, split: split(total, list, (zero) => plan(zeroed(recipe, zero, '').cookSteps)) }
}

// A planned meal: re-plans with the waits collapsed, same kitchen and options.
export function mealTimeSplit(
  schedule: Schedule,
  recipes: Recipe[],
  kitchen: KitchenPreset,
  numCooks: number,
  opts: ScheduleOptions,
): TimeSplit {
  const list = recipes.flatMap((r, i) => {
    const kinds = waitKinds(r.cookSteps)
    return r.cookSteps
      .filter((s) => kinds.has(s.id))
      .map((s) => ({ key: `${i}:${s.id}`, kind: kinds.get(s.id)!, description: s.description }))
  })
  return split(schedule.makespan_min, list, (zero) =>
    scheduleRecipes(recipes.map((r, i) => zeroed(r, zero, `${i}:`)), kitchen, numCooks, opts).makespan_min,
  )
}

export function formatMinutes(min: number): string {
  if (min >= 2 * 1440) return `${Math.round(min / 1440)} days`
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

// "~ 1 hr 10 min · +1 hr cooling · +8 hr ahead"
export function formatTimeSplit(s: TimeSplit): string {
  return [`~ ${formatMinutes(s.readyMin)}`, ...timeSplitExtras(s)].join(' · ')
}

// The waits beside the headline, e.g. ["+1 hr cooling", "+8 hr ahead"].
export function timeSplitExtras(s: TimeSplit): string[] {
  const out: string[] = []
  if (s.coolingMin > 0) out.push(`+${formatMinutes(s.coolingMin)} ${s.coolingWord}`)
  if (s.aheadMin > 0) out.push(`+${formatMinutes(s.aheadMin)} ahead`)
  return out
}
