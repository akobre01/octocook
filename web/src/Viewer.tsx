import { useCallback, useMemo, useState } from 'react'
import type { CookStep, Recipe, StepView } from './types'
import { RECIPES } from './lib/loadRecipes'
import { useKeepAwake } from './lib/useKeepAwake'
import { useVoiceCommands } from './lib/useVoiceCommands'
import type { VoiceCommand } from './lib/voiceGrammar'
import { StepStack } from './components/StepStack'
import { Timeline } from './components/Timeline'

interface Props {
  onExit: () => void
}

function toStepView(step: CookStep, recipe: Recipe): StepView {
  return {
    description: step.description,
    duration_min: step.duration_min,
    active: step.active,
    tools: step.tools,
    recipeName: recipe.name,
    recipeIcon: recipe.icon,
  }
}

// Offline recipe viewer. Picks a bundled recipe, then walks it linearly with a
// three-step view, a proportional timeline, and voice control — no network.
export function Viewer({ onExit }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<'steps' | 'timeline'>('steps')

  // Keep the screen awake only while actually viewing a recipe.
  useKeepAwake(recipe !== null)

  const steps = useMemo<StepView[]>(
    () => (recipe ? recipe.cookSteps.map((s) => toStepView(s, recipe)) : []),
    [recipe],
  )

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, steps.length - 1)),
    [steps.length],
  )
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  const handleCommand = useCallback(
    (cmd: VoiceCommand) => {
      switch (cmd) {
        case 'next': goNext(); break
        case 'prev': goPrev(); break
        case 'timeline': setMode('timeline'); break
        case 'steps': setMode('steps'); break
      }
    },
    [goNext, goPrev],
  )

  const voice = useVoiceCommands(handleCommand)

  const openRecipe = (r: Recipe) => {
    setRecipe(r)
    setIndex(0)
    setMode('steps')
  }

  const closeRecipe = () => {
    setRecipe(null)
    void voice.stop()
  }

  if (!recipe) {
    return (
      <div className="viewer">
        <header className="viewer-header">
          <button className="link" onClick={onExit}>← Back</button>
          <h1>View a recipe</h1>
        </header>
        {RECIPES.length === 0 ? (
          <p className="muted">No bundled recipes found.</p>
        ) : (
          <ul className="viewer-recipe-list">
            {RECIPES.map((r) => (
              <li key={r.name}>
                <button className="viewer-recipe" onClick={() => openRecipe(r)}>
                  <span className="icon">{r.icon ?? '🍽️'}</span>
                  <span className="title">{r.name}</span>
                  <span className="muted">{r.cookSteps.length} steps</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="viewer">
      <header className="viewer-header">
        <button className="link" onClick={closeRecipe}>← Recipes</button>
        <h1>{recipe.icon} {recipe.name}</h1>
        <div className="viewer-controls">
          {voice.supported && (
            <button
              className={voice.listening ? 'mic active' : 'mic'}
              onClick={voice.toggle}
              title={voice.listening ? 'Stop voice control' : 'Start voice control'}
            >
              {voice.listening ? '🎙️' : '🎤'}
            </button>
          )}
          <button onClick={() => setMode((m) => (m === 'steps' ? 'timeline' : 'steps'))}>
            {mode === 'steps' ? 'Full recipe' : 'Step view'}
          </button>
        </div>
      </header>

      {mode === 'steps' ? (
        <StepStack
          steps={steps}
          currentIndex={index}
          onPrev={goPrev}
          onNext={goNext}
        />
      ) : (
        <Timeline
          steps={steps}
          currentIndex={index}
          onSelect={(i) => {
            setIndex(i)
            setMode('steps')
          }}
        />
      )}

      {voice.listening && (
        <div className="viewer-heard muted">
          {voice.lastHeard ? `heard: “${voice.lastHeard}”` : 'Listening… say “next”, “previous”, or “full recipe”'}
        </div>
      )}
    </div>
  )
}
