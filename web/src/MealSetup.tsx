import { useState } from 'react'
import type { KitchenPreset, Recipe } from './types'
import { RECIPES } from './lib/loadRecipes'
import { KITCHENS } from './lib/kitchens'

interface Props {
  selected: Set<string>
  onSelectedChange: (selected: Set<string>) => void
  onExit: () => void
  timing: boolean
  onTimingChange: (on: boolean) => void
  onStart: (recipes: Recipe[], kitchen: KitchenPreset) => void
}

// The recipe list: pick one recipe to cook it, or several to interleave them
// for one cook. Styled like the octocook scheduler Setup, but over the bundled
// recipes/kitchens (offline).
export function MealSetup({ selected, onSelectedChange, timing, onTimingChange, onExit, onStart }: Props) {
  const [kitchen, setKitchen] = useState(KITCHENS[0].name)

  const toggle = (name: string) => {
    const n = new Set(selected)
    if (n.has(name)) n.delete(name)
    else n.add(name)
    onSelectedChange(n)
  }

  const chosen = RECIPES.filter((r) => selected.has(r.name))
  const kit = KITCHENS.find((k) => k.name === kitchen) ?? KITCHENS[0]

  return (
    <div className="viewer">
      <header className="viewer-header">
        <button className="link" onClick={onExit}>← Back</button>
        <h1>Recipes</h1>
      </header>
      <p className="muted meal-setup-hint">Pick a recipe — or several, and we'll interleave them for one cook.</p>

      <label className="mise-toggle">
        <input type="checkbox" checked={timing} onChange={(e) => onTimingChange(e.target.checked)} />
        <span>
          ⏱ <strong>Timing mode</strong>
          <span className="muted"> — adds a ⏱ button to time your real pace and save it as a variant</span>
        </span>
      </label>

      {KITCHENS.length > 1 && (
        <label className="meal-kitchen">
          Kitchen
          <select value={kitchen} onChange={(e) => setKitchen(e.target.value)}>
            {KITCHENS.map((k) => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
        </label>
      )}

      {RECIPES.length === 0 ? (
        <p className="muted">No bundled recipes found.</p>
      ) : (
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
      )}

      <div className="meal-panel">
        <div className="meal-header">
          <strong>🍲 Your meal</strong>
          <span className="muted">
            {selected.size === 0 ? 'No recipes selected' : `${selected.size} recipe${selected.size === 1 ? '' : 's'}`}
          </span>
        </div>
        <button className="primary" disabled={selected.size === 0} onClick={() => onStart(chosen, kit)}>
          {selected.size > 1 ? 'Plan meal →' : 'Open recipe →'}
        </button>
      </div>
    </div>
  )
}
