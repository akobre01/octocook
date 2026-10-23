import type { CookStep, Recipe, RecipeVariant } from '../types'

// Local, offline persistence for user-saved recipe variants. Backed by the
// WebView's localStorage (synchronous, survives app restarts, no network). The
// bundled recipes are never written here — they remain the immutable Original.

const STORE_KEY = 'octocook.viewer.variants'
const SEQ_KEY = 'octocook.viewer.variantSeq'

type Store = Record<string, RecipeVariant[]>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* quota / disabled storage — nothing we can do, keep running */
  }
}

function nextId(): string {
  let n: number
  try {
    n = parseInt(localStorage.getItem(SEQ_KEY) ?? '0', 10) || 0
  } catch {
    n = 0
  }
  n += 1
  try {
    localStorage.setItem(SEQ_KEY, String(n))
  } catch {
    /* ignore */
  }
  return `v${n}`
}

// Deep-copy steps so edits to a variant never alias the bundled recipe arrays.
export function cloneSteps(steps: CookStep[]): CookStep[] {
  return steps.map((s) => ({ ...s, tools: [...s.tools], depends_on: [...s.depends_on] }))
}

export function listVariants(recipeName: string): RecipeVariant[] {
  return readStore()[recipeName] ?? []
}

export function getVariant(id: string): RecipeVariant | null {
  const store = readStore()
  for (const list of Object.values(store)) {
    const found = list.find((v) => v.id === id)
    if (found) return found
  }
  return null
}

export function createVariant(base: Recipe, name: string): RecipeVariant {
  const now = Date.now()
  const variant: RecipeVariant = {
    id: nextId(),
    recipeName: base.name,
    name: name.trim() || 'Untitled',
    cookSteps: cloneSteps(base.cookSteps),
    createdAt: now,
    updatedAt: now,
  }
  const store = readStore()
  store[base.name] = [...(store[base.name] ?? []), variant]
  writeStore(store)
  return variant
}

export function updateVariant(variant: RecipeVariant): RecipeVariant {
  const updated = { ...variant, updatedAt: Date.now() }
  const store = readStore()
  const list = store[variant.recipeName] ?? []
  store[variant.recipeName] = list.map((v) => (v.id === variant.id ? updated : v))
  writeStore(store)
  return updated
}

export function deleteVariant(id: string): void {
  const store = readStore()
  for (const key of Object.keys(store)) {
    store[key] = store[key].filter((v) => v.id !== id)
    if (store[key].length === 0) delete store[key]
  }
  writeStore(store)
}
