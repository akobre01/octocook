import { useMemo, useState } from 'react'
import type { Recipe } from '../types'
import { mergeMeal } from '../lib/ingredientMerge'
import { recipeColor } from '../lib/recipeColors'

interface Props {
  recipes: Recipe[]
  totalMin: number // meal makespan
  activeMin: number // combined hands-on time
}

function formatTotal(min: number): string {
  if (min < 60) return `~ ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `~ ${h} hr ${m} min` : `~ ${h} hr`
}

function shortName(name: string): string {
  const head = name.split(/[—–]/)[0].trim()
  return head.length > 20 ? head.slice(0, 19) + '…' : head
}

// Merged ingredients across all recipes in the meal. Recipe filter buttons on
// top (none selected by default, one at a time) highlight that recipe's
// ingredients in its color and swap shared amounts to that recipe's share.
export function MealIngredients({ recipes, totalMin, activeMin }: Props) {
  const merged = useMemo(() => mergeMeal(recipes), [recipes])
  const [sel, setSel] = useState<number | null>(null)

  return (
    <div className="ingredients-view">
      <div className="meal-filter">
        {recipes.map((r, i) => {
          const c = recipeColor(i)
          const on = sel === i
          return (
            <button
              key={r.name}
              className={on ? 'meal-filter-btn on' : 'meal-filter-btn'}
              style={{ borderColor: c.accent, background: on ? c.tint : undefined, color: on ? c.accent : undefined }}
              onClick={() => setSel(on ? null : i)}
            >
              {r.icon ?? '🍽️'} {shortName(r.name)}
            </button>
          )
        })}
      </div>

      <ul className="ingredient-grid">
        {merged.map((ing) => {
          const inSel = sel != null && ing.recipeIndices.includes(sel)
          const dim = sel != null && !inSel
          const c = sel != null ? recipeColor(sel) : null
          const amount = sel != null && inSel ? ing.perRecipe[sel] : ing.combined
          return (
            <li
              key={ing.key}
              className={`ingredient-item${dim ? ' dim' : ''}`}
              style={inSel && c ? { borderColor: c.accent, background: c.tint } : undefined}
            >
              <span className="ing-icon">{ing.icon}</span>
              <span className="ing-text">
                {amount && amount !== '—' ? `${amount} ` : ''}
                {ing.name}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="ingredients-total muted">Total time {formatTotal(totalMin)}</div>
      <div className="ingredients-active">Active time {formatTotal(activeMin)}</div>
    </div>
  )
}
