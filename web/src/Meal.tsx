import { useState } from 'react'
import type { KitchenPreset, Recipe } from './types'
import { scheduleMeal, type MealPlan } from './lib/schedulerProvider'
import { MealSetup } from './MealSetup'
import { MealView } from './MealView'

interface Props {
  onExit: () => void
}

// Container for the offline multi-recipe meal flow: setup → plan → cook.
export function Meal({ onExit }: Props) {
  const [planned, setPlanned] = useState<{ recipes: Recipe[]; plan: MealPlan } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (recipes: Recipe[], kitchen: KitchenPreset) => {
    setError(null)
    try {
      const plan = await scheduleMeal(recipes, kitchen, 1)
      setPlanned({ recipes, plan })
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  if (planned) {
    return (
      <MealView
        recipes={planned.recipes}
        schedule={planned.plan.schedule}
        source={planned.plan.source}
        onExit={() => setPlanned(null)}
      />
    )
  }
  return <MealSetup onExit={onExit} onStart={start} error={error} />
}
