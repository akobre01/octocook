import { useState } from 'react'
import type { KitchenPreset, Recipe } from './types'
import { MealSetup } from './MealSetup'
import { MealView } from './MealView'
import { loadTimingPref, saveTimingPref } from './lib/prefs'

interface Props {
  onExit: () => void
}

// Container for the offline recipe flow: pick one or more recipes → cook them.
// A single recipe is just a one-recipe meal. The selection survives a trip
// into the meal and back.
export function Meal({ onExit }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [timing, setTiming] = useState(loadTimingPref)
  const [open, setOpen] = useState<{ recipes: Recipe[]; kitchen: KitchenPreset } | null>(null)

  if (open) {
    return <MealView recipes={open.recipes} kitchen={open.kitchen} timingEnabled={timing} onExit={() => setOpen(null)} />
  }
  return (
    <MealSetup
      selected={selected}
      onSelectedChange={setSelected}
      timing={timing}
      onTimingChange={(on) => { setTiming(on); saveTimingPref(on) }}
      onExit={onExit}
      onStart={(recipes, kitchen) => setOpen({ recipes, kitchen })}
    />
  )
}
