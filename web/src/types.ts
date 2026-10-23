// ---------- Recipe viewer (offline) ----------

// Mirrors the `cookSteps` schema emitted by tools/recipe_enrichment.py and
// embedded in each recipe's Notion JSON-LD block.
export interface CookStep {
  id: string
  description: string
  duration_min: number
  active: boolean
  tools: string[]
  depends_on: string[]
  // Ingredient phrases this step uses, e.g. ["3 eggs", "1 cup sugar"]. Optional:
  // steps like preheating have none.
  ingredients?: string[]
}

// A bundled, fully-structured recipe the viewer walks linearly.
export interface Recipe {
  name: string
  icon?: string
  cookSteps: CookStep[]
}

// A user-saved, editable variant of a bundled recipe (e.g. per cook). Owns a
// full copy of cookSteps, so field edits, structural edits, and personal
// timings are all just the variant's steps. The bundled Recipe is the
// immutable "Original"; variants never mutate it. Persisted in localStorage.
export interface RecipeVariant {
  id: string
  recipeName: string // FK to the bundled base (names are unique)
  name: string // user label, e.g. "Alice", "quick"
  cookSteps: CookStep[]
  createdAt: number
  updatedAt: number
}

// The presentational shape the shared StepCard / Timeline render. Both the
// viewer (from CookStep) and the scheduler's CookView (from ScheduleStep) map
// onto this so the UI primitives stay backend-agnostic.
export interface StepView {
  description: string
  duration_min: number
  active: boolean
  tools: string[]
  ingredients?: string[]
  recipeName?: string
  recipeIcon?: string
  accent?: string // recipe color (meal cook mode); undefined = neutral
}

export interface RecipeOut {
  id: string
  title: string
  icon: string
  found_in: string
  rating: string
  enriched: boolean
}

// A kitchen's tool inventory + substitution graph, mirroring
// server/presets/<name>/{inventory,substitutions}.yaml. Bundled in lib/kitchens.
export interface SubRule {
  tool: string | null // null = "by hand" (no tool reserved)
  time_multiplier: number
  note: string
}

export interface KitchenPreset {
  name: string
  inventory: Record<string, number> // tool -> count (includes "cook")
  substitutions: Record<string, SubRule[]>
}

export interface ScheduleStep {
  step_id: string
  recipe: string
  description: string
  duration_min: number
  active: boolean
  tools: string[]
  depends_on: string[]
  ingredients: string[]
  start_min: number
  end_min: number
  start_clock: string
  end_clock: string
  cook_id: number | null
}

export interface Schedule {
  makespan_min: number
  makespan_label: string
  substitutions: Substitution[]
  steps: ScheduleStep[]
  icons: Record<string, string>
  num_cooks: number
}

export interface Substitution {
  recipe: string
  step_id: string
  original_tool: string
  substitute_tool: string | null
  time_multiplier: number
  note: string
}

export interface StepState {
  started_at: string | null
  completed_at: string | null
  actual_seconds: number | null
}

export interface Session {
  id: string
  created_at: string
  num_cooks: number
  kitchen: string
  recipe_titles: string[]
  schedule: Schedule
  step_state: Record<string, StepState>
}
