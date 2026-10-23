import type { Recipe } from '../types'
import { ingredientIcon } from './ingredientIcons'

// Merge the ingredients of several recipes into one deduped list. Matching is
// deliberately simple (normalize to a canonical name); the user fixes mismatches
// in the editor. Amounts are summed only when units match, else shown as both.

export interface MergedIngredient {
  key: string // canonical name used for grouping
  name: string // display noun, e.g. "garlic cloves"
  icon: string
  combined: string // combined amount shown by default, e.g. "6" or "1 cup + 2 tbsp"
  perRecipe: Record<number, string> // recipeIndex -> that recipe's amount string
  recipeIndices: number[]
}

const UNITS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg', 'ml', 'l',
  'pinch', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'bunch', 'bunches',
  'sprig', 'sprigs', 'head', 'heads',
])
const FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}
const DESCRIPTORS = [
  'a few', 'a large pinch of', 'large pinch of', 'a pinch of', 'pinch of',
  'a small handful of', 'small handful of', 'a handful of', 'handful of', 'a ',
]

function parseNum(tok: string): number | null {
  if (FRACTIONS[tok] != null) return FRACTIONS[tok]
  if (/^\d+$/.test(tok)) return parseInt(tok, 10)
  const frac = tok.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  return null
}

function singularize(name: string): string {
  const parts = name.split(' ')
  const last = parts[parts.length - 1]
  if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) {
    parts[parts.length - 1] = last.slice(0, -1)
  }
  return parts.join(' ')
}

interface Parsed { amount: string; unit: string; value: number | null; name: string; canonical: string }

function parseIngredient(phrase: string): Parsed {
  const raw = phrase.trim()
  const lower = raw.toLowerCase()
  const amountParts: string[] = []
  let value: number | null = 0
  let sawNum = false

  // Leading numeric tokens (incl. mixed numbers like "1 3/4" and unicode fractions).
  const tokens = raw.split(/\s+/)
  let i = 0
  while (i < tokens.length) {
    const n = parseNum(tokens[i].replace(/[–-]\d+$/, '')) // ranges "2-3" -> 2
    if (n == null) break
    value = (value ?? 0) + n
    sawNum = true
    amountParts.push(tokens[i])
    i++
  }
  if (!sawNum) {
    value = null
    for (const d of DESCRIPTORS) {
      if (lower.startsWith(d)) {
        amountParts.push(raw.slice(0, d.length).trim())
        i = raw.slice(0, d.length).trim().split(/\s+/).length
        break
      }
    }
  }
  // Optional unit token.
  let unit = ''
  if (i < tokens.length) {
    const u = tokens[i].toLowerCase().replace(/[^a-z]/g, '')
    if (UNITS.has(u)) {
      unit = u
      amountParts.push(tokens[i])
      i++
    }
  }
  const name = tokens.slice(i).join(' ').replace(/,.*$/, '').trim()
  const display = name || raw
  return {
    amount: amountParts.join(' '),
    unit,
    value: sawNum ? value : null,
    name: display,
    canonical: singularize(display.toLowerCase()),
  }
}

export function mergeMeal(recipes: Recipe[]): MergedIngredient[] {
  const groups = new Map<string, { name: string; items: { i: number; p: Parsed }[] }>()

  recipes.forEach((recipe, i) => {
    const seen = new Set<string>()
    for (const step of recipe.cookSteps) {
      for (const ing of step.ingredients ?? []) {
        const key = ing.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        const p = parseIngredient(ing)
        if (!p.canonical) continue
        const g = groups.get(p.canonical) ?? { name: p.name, items: [] }
        if (p.name.length > g.name.length) g.name = p.name // prefer the fuller phrasing
        g.items.push({ i, p })
        groups.set(p.canonical, g)
      }
    }
  })

  const out: MergedIngredient[] = []
  for (const [key, g] of groups) {
    const perRecipe: Record<number, string> = {}
    for (const { i, p } of g.items) {
      perRecipe[i] = (p.amount || '').trim() || '—'
    }
    const units = new Set(g.items.map((x) => x.p.unit))
    const allValued = g.items.every((x) => x.p.value != null)
    let combined: string
    if (g.items.length === 1) {
      combined = g.items[0].p.amount || ''
    } else if (units.size === 1 && allValued) {
      const sum = g.items.reduce((n, x) => n + (x.p.value ?? 0), 0)
      const rounded = Math.round(sum * 100) / 100
      const unit = [...units][0]
      combined = unit ? `${rounded} ${unit}` : `${rounded}`
    } else {
      combined = [...new Set(g.items.map((x) => x.p.amount).filter(Boolean))].join(' + ')
    }
    out.push({
      key,
      name: g.name,
      icon: ingredientIcon(g.name),
      combined,
      perRecipe,
      recipeIndices: [...new Set(g.items.map((x) => x.i))].sort((a, b) => a - b),
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
