import type { CookStep } from '../types'
import { ingredientIcon } from '../lib/ingredientIcons'
import { formatMinutes, formatTimeSplit, type TimeSplit } from '../lib/timing'

interface Props {
  steps: CookStep[]
  time: TimeSplit // from recipeTime: the plan, minus cooling and do-ahead waits
  onStartCooking: () => void
}

// The default view for a recipe: every ingredient it needs, each with an icon
// and quantity, laid out in columns, with a grayed total-time estimate below.
// Ingredients are aggregated across all steps (exact duplicates removed).
export function IngredientsView({ steps, time, onStartCooking }: Props) {
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

      <div className="ingredients-total muted">Total time {formatTimeSplit(time)}</div>
      <div className="ingredients-active">Active time ~ {formatMinutes(activeMin)}</div>

      <button className="primary start-cooking" onClick={onStartCooking}>
        Start cooking →
      </button>
    </div>
  )
}
