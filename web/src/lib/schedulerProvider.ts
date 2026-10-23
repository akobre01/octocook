import type { KitchenPreset, Recipe, Schedule } from '../types'
import { scheduleRecipes } from './scheduler'

// The scheduler seam. Auto-selects: prefer the remote Python/CP-SAT scheduler
// when a backend is reachable (better plans, future online "cook together"
// mode), else fall back to the offline TS heuristic. Remote is STUBBED for now
// — this is the single place online mode plugs in later.

export interface MealPlan {
  schedule: Schedule
  source: 'remote' | 'local'
}

async function remoteAvailable(): Promise<boolean> {
  // Stub: no online mode yet. Later: probe `${VITE_API_BASE_URL}/health` with a
  // short timeout and return true when reachable.
  return false
}

export async function scheduleMeal(
  recipes: Recipe[],
  kitchen: KitchenPreset,
  numCooks = 1,
): Promise<MealPlan> {
  if (await remoteAvailable()) {
    // future: POST recipes+kitchen+numCooks to the backend, map the response
    // (schedule_to_dict shape) straight onto Schedule, return source: 'remote'.
  }
  return { schedule: scheduleRecipes(recipes, kitchen, numCooks), source: 'local' }
}
