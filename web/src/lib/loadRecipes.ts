import type { Recipe } from '../types'

// Bundle every recipe JSON under src/recipes/ into the app at build time.
// `eager` inlines them so no network fetch is ever needed — the viewer works
// fully offline. Add a recipe by dropping a new .json file in that folder.
const modules = import.meta.glob<{ default: Recipe }>('../recipes/*.json', {
  eager: true,
})

export const RECIPES: Recipe[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.name.localeCompare(b.name))
