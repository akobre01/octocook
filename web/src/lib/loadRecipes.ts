import type { CookStep, Recipe } from '../types'

// Bundle every recipe JSON under src/recipes/ into the app at build time.
// `eager` inlines them so no network fetch is ever needed — the viewer works
// fully offline. Add a recipe by dropping a new .json file in that folder.
const modules = import.meta.glob<{ default: Recipe }>('../recipes/*.json', {
  eager: true,
})

// Deterministic fixes for known enrichment mistakes, mirroring
// tools/recipe_enrichment._normalize_steps: a step that only puts water on to
// boil is hands-off (like a preheat), so it starts right away — also in
// mise-en-place mode — instead of waiting behind the prep.
const BOIL_WATER = /^(bring|put|set|boil|heat)\b[^;.]*\bwater\b[^;.]*\b(boil|simmer)|^boil\b[^;.]*\bwater\b/i
const BOIL_WATER_NOT = /\b(cook|add|blanch|until|al dente|tender|reduce|stir|then)\b|\band\b/i

export function isBoilWaterStep(description: string): boolean {
  return BOIL_WATER.test(description) && !BOIL_WATER_NOT.test(description)
}

function normalize(step: CookStep): CookStep {
  return isBoilWaterStep(step.description) ? { ...step, active: false } : step
}

export const RECIPES: Recipe[] = Object.values(modules)
  .map((m) => ({ ...m.default, cookSteps: m.default.cookSteps.map(normalize) }))
  .sort((a, b) => a.name.localeCompare(b.name))
