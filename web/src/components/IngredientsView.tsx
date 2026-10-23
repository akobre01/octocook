import type { CookStep } from '../types'
import { ingredientIcon } from '../lib/ingredientIcons'

interface Props {
  steps: CookStep[]
  onStartCooking: () => void
}

function formatTotal(totalMin: number): string {
  if (totalMin < 60) return `~ ${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `~ ${h} hr ${m} min` : `~ ${h} hr`
}

// The default view for a recipe: every ingredient it needs, each with an icon
// and quantity, laid out in columns, with a grayed total-time estimate below.
// Ingredients are aggregated across all steps (exact duplicates removed).
export function IngredientsView({ steps, onStartCooking }: Props) {
  const seen = new Set<string>()
  const ingredients: string[] = []
  for (const step of steps) {
    for (const ing of step.ingredients ?? []) {
      const text = ing.trim()
      const key = text.toLowerCase()
      if (text && !seen.has(key)) {
        seen.add(key)
        ingredients.push(text)
      }
    }
  }

  const totalMin = steps.reduce((sum, s) => sum + Math.max(0, s.duration_min), 0)
  const activeMin = steps.reduce((sum, s) => sum + (s.active ? Math.max(0, s.duration_min) : 0), 0)

  return (
    <div className="ingredients-view">
      {ingredients.length === 0 ? (
        <p className="muted">No ingredients listed for this recipe.</p>
      ) : (
        <ul className="ingredient-grid">
          {ingredients.map((ing, i) => (
            <li key={i} className="ingredient-item">
              <span className="ing-icon">{ingredientIcon(ing)}</span>
              <span className="ing-text">{ing}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ingredients-total muted">Total time {formatTotal(totalMin)}</div>
      <div className="ingredients-active">Active time {formatTotal(activeMin)}</div>

      <button className="primary start-cooking" onClick={onStartCooking}>
        Start cooking →
      </button>
    </div>
  )
}
