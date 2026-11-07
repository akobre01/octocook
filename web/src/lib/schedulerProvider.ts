import type { KitchenPreset, Recipe, Schedule } from '../types'
import { scheduleRecipes, type ScheduleOptions } from './scheduler'

// The scheduler seam: the single place online mode (the remote Python/CP-SAT
// scheduler — better plans, future "cook together") plugs in later. For now
// every plan comes from the offline TS heuristic.

export interface MealPlan {
  schedule: Schedule
  source: 'remote' | 'local'
}

// Synchronous so the meal view can re-plan instantly when a variant, an edit,
// or the mise-en-place toggle changes. Online mode will need an async path
// (probe the backend, POST recipes+kitchen+numCooks+opts, map the
// schedule_to_dict response onto Schedule) alongside this local one.
export function scheduleMeal(
  recipes: Recipe[],
  kitchen: KitchenPreset,
  numCooks = 1,
  opts: ScheduleOptions = {},
): MealPlan {
  return { schedule: scheduleRecipes(recipes, kitchen, numCooks, opts), source: 'local' }
}
