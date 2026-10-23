import { useState } from 'react'
import type { KitchenPreset, Recipe } from './types'
import { RECIPES } from './lib/loadRecipes'
import { KITCHENS } from './lib/kitchens'

interface Props {
  onExit: () => void
  onStart: (recipes: Recipe[], kitchen: KitchenPreset) => void
  error?: string | null
}

// Pick several recipes + a kitchen, then plan the meal. Styled like the
// octocook scheduler Setup, but over the bundled recipes/kitchens (offline).
export function MealSetup({ onExit, onStart, error }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [kitchen, setKitchen] = useState(KITCHENS[0].name)

  const toggle = (name: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const chosen = RECIPES.filter((r) => selected.has(r.name))
  const kit = KITCHENS.find((k) => k.name === kitchen) ?? KITCHENS[0]

  return (
    <div className="viewer">
      <header className="viewer-header">
        <button className="link" onClick={onExit}>← Back</button>
        <h1>Cook a meal</h1>
      </header>
      <p className="muted meal-setup-hint">Pick the dishes and a kitchen — we'll interleave them for one cook.</p>

      <label className="meal-kitchen">
        Kitchen
        <select value={kitchen} onChange={(e) => setKitchen(e.target.value)}>
          {KITCHENS.map((k) => (
            <option key={k.name} value={k.name}>{k.name}</option>
          ))}
        </select>
      </label>

      <ul className="recipe-grid">
        {RECIPES.map((r) => (
          <li
            key={r.name}
            className={selected.has(r.name) ? 'recipe-card selected' : 'recipe-card'}
            onClick={() => toggle(r.name)}
          >
            <div className="recipe-head">
              <span className="icon">{r.icon ?? '🍽️'}</span>
              {selected.has(r.name) && <span className="check">✓</span>}
            </div>
            <div className="title">{r.name}</div>
            <div className="meta"><span className="found-in">{r.cookSteps.length} steps</span></div>
          </li>
        ))}
      </ul>

      <div className="meal-panel">
        <div className="meal-header">
          <strong>🍲 Your meal</strong>
          <span className="muted">
            {selected.size === 0 ? 'No recipes selected' : `${selected.size} recipe${selected.size === 1 ? '' : 's'}`}
          </span>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={selected.size === 0} onClick={() => onStart(chosen, kit)}>
          Plan meal →
        </button>
      </div>
    </div>
  )
}
