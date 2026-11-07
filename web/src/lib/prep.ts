// Mise en place: the knife-and-board work (chop, peel, wash, ...) that can all
// be done before anything goes on the heat. In mise-en-place mode the meal
// scheduler finishes every prep step before any other hands-on step starts.

// A step is prep when it's hands-on, uses only these tools (or none), its
// description has a prep verb and no cooking verb, and everything it depends
// on is prep too (so "peel the charred peppers" — after roasting — is not). A
// step's optional `prep` field overrides the tool/verb heuristic. Quick steps
// that start something hands-off count too (see the end of prepStepIds).
const PREP_TOOLS = new Set(['chef_knife', 'cutting_board', 'peeler', 'grater', 'colander'])
const PREP_VERB =
  /\b(chop|dice|mince|slice|grate|peel|wash|rinse|trim|cut|smash|tear|stem|zest|seed|core|halve|quarter|shred|julienne|measure|pick)/i
const COOK_VERB = /\b(toast|cook|heat|saut|fry|bake|roast|boil|simmer|melt|warm|sear|char)/i

const STARTER_MAX_MIN = 3

interface PrepCandidate {
  id: string
  description: string
  duration_min: number
  active: boolean
  tools: string[]
  depends_on: string[]
  prep?: boolean
}

export function prepStepIds(steps: PrepCandidate[]): Set<string> {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const memo = new Map<string, boolean>()
  const isPrep = (s: PrepCandidate): boolean => {
    const cached = memo.get(s.id)
    if (cached !== undefined) return cached
    memo.set(s.id, false) // cycle guard
    const looksPrep =
      s.prep ??
      (s.tools.every((t) => PREP_TOOLS.has(t)) &&
        PREP_VERB.test(s.description) &&
        !COOK_VERB.test(s.description))
    const ok =
      s.active &&
      looksPrep &&
      s.depends_on.every((d) => {
        const dep = byId.get(d)
        return !dep || isPrep(dep)
      })
    memo.set(s.id, ok)
    return ok
  }
  const prep = new Set(steps.filter(isPrep).map((s) => s.id))

  // Also up front: a quick hands-on step that just gets something hands-off
  // going — "rinse lentils into the pot" before they come to a boil, "spread
  // the oats on a sheet pan" before they toast — so long waits start before
  // the chopping, not after it.
  const succ = new Map<string, PrepCandidate[]>()
  for (const s of steps) for (const d of s.depends_on) (succ.get(d) ?? succ.set(d, []).get(d)!).push(s)
  for (const s of steps) {
    if (
      s.active &&
      !prep.has(s.id) &&
      s.prep !== false &&
      s.duration_min <= STARTER_MAX_MIN &&
      s.depends_on.every((d) => !byId.has(d) || prep.has(d)) &&
      (succ.get(s.id) ?? []).some((n) => !n.active)
    ) {
      prep.add(s.id)
    }
  }
  return prep
}

// The on/off preference, remembered across recipes and meals.
const PREF_KEY = 'octocook.miseEnPlace'

export function loadMisePref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMisePref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0')
  } catch {
    // Storage unavailable (private mode etc.) — the toggle still works this session.
  }
}
