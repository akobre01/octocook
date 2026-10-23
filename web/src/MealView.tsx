import { useCallback, useMemo, useState } from 'react'
import type { Recipe, Schedule, ScheduleStep, StepView } from './types'
import { recipeColor, type RecipeColor } from './lib/recipeColors'
import { useKeepAwake } from './lib/useKeepAwake'
import { useVoiceCommands } from './lib/useVoiceCommands'
import type { VoiceCommand } from './lib/voiceGrammar'
import { StepStack } from './components/StepStack'
import { MealIngredients } from './components/MealIngredients'
import { ScheduleGantt } from './components/ScheduleGantt'
import { BackgroundRail } from './components/BackgroundRail'

interface Props {
  recipes: Recipe[]
  schedule: Schedule
  source: 'remote' | 'local'
  onExit: () => void // back to meal setup
}

type Mode = 'ingredients' | 'cook' | 'gantt'

function toStepView(s: ScheduleStep, accent?: string, icon?: string): StepView {
  return {
    description: s.description,
    duration_min: s.duration_min,
    active: s.active,
    tools: s.tools,
    ingredients: s.ingredients,
    recipeName: s.recipe,
    recipeIcon: icon,
    accent,
  }
}

// The planned meal: Ingredients (merged) / Cook (interleaved steps + background
// rail) / Full recipe (schedule Gantt). One cook; fully offline.
export function MealView({ recipes, schedule, source, onExit }: Props) {
  const [mode, setMode] = useState<Mode>('ingredients')
  const [index, setIndex] = useState(0)
  useKeepAwake(true)

  const colorByRecipe = useMemo(() => {
    const m: Record<string, RecipeColor> = {}
    recipes.forEach((r, i) => (m[r.name] = recipeColor(i)))
    return m
  }, [recipes])

  // Cook mode walks every step in schedule order (so "preheat the oven" shows
  // up as the first thing you do, not only in the background rail).
  const orderedSteps = schedule.steps
  const passiveSteps = useMemo(() => schedule.steps.filter((s) => !s.active), [schedule])
  const stepViews = useMemo(
    () => orderedSteps.map((s) => toStepView(s, colorByRecipe[s.recipe]?.accent, schedule.icons[s.recipe])),
    [orderedSteps, colorByRecipe, schedule.icons],
  )
  // Combined hands-on time for the ingredients view (active steps only).
  const activeMin = useMemo(
    () => schedule.steps.filter((s) => s.active).reduce((n, s) => n + s.duration_min, 0),
    [schedule],
  )

  const clampedIndex = stepViews.length ? Math.min(Math.max(0, index), stepViews.length - 1) : 0
  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, stepViews.length - 1)), [stepViews.length])
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  const handleCommand = (cmd: VoiceCommand) => {
    switch (cmd) {
      case 'next': goNext(); break
      case 'prev': goPrev(); break
      case 'cook': setMode('cook'); break
      case 'ingredients': setMode('ingredients'); break
      case 'timeline': setMode('gantt'); break
    }
  }
  const voice = useVoiceCommands(handleCommand)

  const cur = orderedSteps[clampedIndex]

  return (
    <div className="viewer">
      <header className="viewer-header">
        <button className="link" onClick={() => { void voice.stop(); onExit() }}>← Meals</button>
        <h1>Meal · {recipes.length} recipes</h1>
        <div className="viewer-controls">
          {voice.supported && (
            <button className={voice.listening ? 'mic active' : 'mic'} onClick={voice.toggle}>
              {voice.listening ? '🎙️' : '🎤'}
            </button>
          )}
        </div>
      </header>
      <div className="meal-subhead muted">
        total ~ {schedule.makespan_label} · planned {source === 'local' ? 'offline' : 'online'}
      </div>

      <div className="view-tabs">
        <button className={mode === 'ingredients' ? 'on' : ''} onClick={() => setMode('ingredients')}>Ingredients</button>
        <button className={mode === 'cook' ? 'on' : ''} onClick={() => setMode('cook')}>Cook</button>
        <button className={mode === 'gantt' ? 'on' : ''} onClick={() => setMode('gantt')}>Full recipe</button>
      </div>

      {mode === 'ingredients' && (
        <MealIngredients recipes={recipes} totalMin={schedule.makespan_min} activeMin={activeMin} />
      )}
      {mode === 'cook' && (
        <div className="cook-layout">
          <div className="cook-main">
            <StepStack steps={stepViews} currentIndex={clampedIndex} onPrev={goPrev} onNext={goNext} />
          </div>
          {cur && (
            <BackgroundRail
              passive={passiveSteps}
              windowStart={cur.start_min}
              windowEnd={cur.end_min}
              excludeId={cur.step_id}
              colors={colorByRecipe}
              icons={schedule.icons}
            />
          )}
        </div>
      )}
      {mode === 'gantt' && <ScheduleGantt steps={schedule.steps} icons={schedule.icons} />}

      {voice.listening && (
        <div className="viewer-heard muted">
          {voice.lastHeard ? `heard: “${voice.lastHeard}”` : 'Listening… say “next”, “cook”, “ingredients”'}
        </div>
      )}
    </div>
  )
}
