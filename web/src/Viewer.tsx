import { useEffect, useMemo, useState } from 'react'
import type { CookStep, Recipe, RecipeVariant, StepView } from './types'
import { RECIPES } from './lib/loadRecipes'
import { useKeepAwake } from './lib/useKeepAwake'
import { useVoiceCommands } from './lib/useVoiceCommands'
import type { VoiceCommand } from './lib/voiceGrammar'
import {
  cloneSteps,
  createVariant,
  listVariants,
  updateVariant,
} from './lib/variantStore'
import { StepStack } from './components/StepStack'
import { Timeline } from './components/Timeline'
import { VariantBar } from './components/VariantBar'
import { RecipeEditor } from './components/RecipeEditor'
import { TimingReview } from './components/TimingReview'

interface Props {
  onExit: () => void
}

type Mode = 'steps' | 'timeline' | 'edit' | 'review'

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

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Offline recipe viewer: walk a recipe (or one of its saved variants) step by
// step, edit it, and time your real pace — all persisted locally, no network.
export function Viewer({ onExit }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [listEditMode, setListEditMode] = useState(false)
  const [variants, setVariants] = useState<RecipeVariant[]>([])
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('steps')

  // Timing state.
  const [timingOn, setTimingOn] = useState(false)
  const [timingStartMs, setTimingStartMs] = useState<number | null>(null)
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())

  // Name prompt for creating a variant when saving edits/timings off Original.
  const [namePrompt, setNamePrompt] = useState<{ onCreate: (v: RecipeVariant) => void } | null>(null)
  const [promptValue, setPromptValue] = useState('')

  useKeepAwake(recipe !== null)

  // Tick once a second while timing, for the live elapsed display.
  useEffect(() => {
    if (!timingOn) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timingOn])

  const activeVariant = useMemo(
    () => variants.find((v) => v.id === activeVariantId) ?? null,
    [variants, activeVariantId],
  )
  const effectiveSteps: CookStep[] = useMemo(
    () => (activeVariant?.cookSteps ?? recipe?.cookSteps ?? []),
    [activeVariant, recipe],
  )
  const steps: StepView[] = useMemo(
    () => (recipe ? effectiveSteps.map((s) => toStepView(s, recipe)) : []),
    [effectiveSteps, recipe],
  )
  const variantLabel = activeVariant?.name ?? 'Original'

  // Derive a clamped index so a shrunk step list (edits, variant switch) never
  // points out of range, without a setState-in-effect round trip.
  const clampedIndex = steps.length ? Math.min(Math.max(0, index), steps.length - 1) : 0

  const resetTiming = () => {
    setTimingOn(false)
    setTimingStartMs(null)
    setActuals({})
  }

  const reloadVariants = (name: string) => setVariants(listVariants(name))

  const openRecipe = (r: Recipe, edit = false) => {
    setRecipe(r)
    setVariants(listVariants(r.name))
    setActiveVariantId(null)
    setIndex(0)
    resetTiming()
    setMode(edit ? 'edit' : 'steps')
  }

  const closeRecipe = () => {
    setRecipe(null)
    setMode('steps')
    resetTiming()
    void voice.stop()
  }

  const selectVariant = (id: string | null) => {
    setActiveVariantId(id)
    setIndex(0)
    resetTiming()
  }

  // Advance, recording the current step's elapsed time when timing is on.
  const handleNext = () => {
    if (timingOn && timingStartMs != null && effectiveSteps[clampedIndex]) {
      const sec = (Date.now() - timingStartMs) / 1000
      setActuals((a) => ({ ...a, [effectiveSteps[clampedIndex].id]: sec }))
      if (clampedIndex < steps.length - 1) {
        setIndex(clampedIndex + 1)
        setTimingStartMs(Date.now())
      } else {
        setTimingOn(false)
        setMode('review')
      }
      return
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  const handlePrev = () => {
    setIndex((i) => Math.max(i - 1, 0))
    if (timingOn) setTimingStartMs(Date.now())
  }

  const handleCommand = (cmd: VoiceCommand) => {
    if (mode === 'edit' || mode === 'review') return
    switch (cmd) {
      case 'next': handleNext(); break
      case 'prev': handlePrev(); break
      case 'timeline': setMode('timeline'); break
      case 'steps': setMode('steps'); break
    }
  }

  const voice = useVoiceCommands(handleCommand)

  const startTiming = () => {
    setMode('steps')
    setIndex(0)
    setActuals({})
    setTimingOn(true)
    setTimingStartMs(Date.now())
  }

  const finishTiming = () => {
    if (timingStartMs != null && effectiveSteps[clampedIndex]) {
      const sec = (Date.now() - timingStartMs) / 1000
      setActuals((a) => ({ ...a, [effectiveSteps[clampedIndex].id]: sec }))
    }
    setTimingOn(false)
    setMode('review')
  }

  // Persist edited steps; create a variant first if we're on Original.
  const saveEditedSteps = (newSteps: CookStep[]) => {
    const copy = cloneSteps(newSteps)
    const apply = (v: RecipeVariant) => {
      updateVariant({ ...v, cookSteps: copy })
      reloadVariants(v.recipeName)
      setActiveVariantId(v.id)
      setMode('steps')
    }
    if (activeVariant) apply(activeVariant)
    else requestVariant(apply)
  }

  // Apply timed durations; create a variant first if we're on Original.
  const saveTimings = (durMap: Record<string, number>) => {
    const apply = (v: RecipeVariant) => {
      const newSteps = v.cookSteps.map((s) => ({ ...s, duration_min: durMap[s.id] ?? s.duration_min }))
      updateVariant({ ...v, cookSteps: newSteps })
      reloadVariants(v.recipeName)
      setActiveVariantId(v.id)
      setMode('steps')
      resetTiming()
    }
    if (activeVariant) apply(activeVariant)
    else requestVariant(apply)
  }

  const requestVariant = (onCreate: (v: RecipeVariant) => void) => {
    // The name-prompt overlay renders in the step view, so leave edit/review
    // mode first — otherwise the prompt would be invisible.
    setMode('steps')
    setPromptValue('')
    setNamePrompt({ onCreate })
  }

  const confirmVariantName = () => {
    if (!namePrompt || !recipe) return
    const name = promptValue.trim()
    if (!name) return
    const v = createVariant(recipe, name)
    reloadVariants(recipe.name)
    namePrompt.onCreate(v)
    setNamePrompt(null)
  }

  // ---------- Recipe list ----------
  if (!recipe) {
    return (
      <div className="viewer">
        <header className="viewer-header">
          <button className="link" onClick={onExit}>← Back</button>
          <h1>View a recipe</h1>
          <button
            className={listEditMode ? 'edit-toggle on' : 'edit-toggle'}
            onClick={() => setListEditMode((e) => !e)}
          >
            {listEditMode ? 'Done' : '✏️ Edit'}
          </button>
        </header>
        {listEditMode && <div className="viewer-heard muted">Pick a recipe to edit</div>}
        {RECIPES.length === 0 ? (
          <p className="muted">No bundled recipes found.</p>
        ) : (
          <ul className="viewer-recipe-list">
            {RECIPES.map((r) => (
              <li key={r.name}>
                <button className="viewer-recipe" onClick={() => openRecipe(r, listEditMode)}>
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

  // ---------- Editing ----------
  if (mode === 'edit') {
    return (
      <RecipeEditor
        recipeName={recipe.name}
        recipeIcon={recipe.icon}
        variantLabel={variantLabel}
        steps={effectiveSteps}
        onDone={saveEditedSteps}
        onCancel={() => setMode('steps')}
      />
    )
  }

  // ---------- Timing review ----------
  if (mode === 'review') {
    return (
      <div className="viewer">
        <header className="viewer-header">
          <button className="link" onClick={() => { setMode('steps'); resetTiming() }}>← Back</button>
          <h1>{recipe.icon} {recipe.name}</h1>
        </header>
        <TimingReview
          steps={effectiveSteps}
          actuals={actuals}
          onSave={saveTimings}
          onDiscard={() => { setMode('steps'); resetTiming() }}
        />
      </div>
    )
  }

  // ---------- Step / timeline view ----------
  const elapsedSec = timingStartMs != null ? Math.max(0, (now - timingStartMs) / 1000) : 0

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
          <button onClick={() => setMode('edit')} title="Edit recipe">✏️</button>
          <button
            className={timingOn ? 'mic active' : ''}
            onClick={() => (timingOn ? finishTiming() : startTiming())}
            title={timingOn ? 'Finish timing' : 'Start timing'}
          >
            ⏱
          </button>
          <button onClick={() => setMode((m) => (m === 'steps' ? 'timeline' : 'steps'))}>
            {mode === 'steps' ? 'Full recipe' : 'Step view'}
          </button>
        </div>
      </header>

      <VariantBar
        base={recipe}
        variants={variants}
        activeVariantId={activeVariantId}
        onSelect={selectVariant}
        onChange={() => reloadVariants(recipe.name)}
      />

      {timingOn && (
        <div className="timing-banner">
          <span>⏱ Timing · step {clampedIndex + 1}/{steps.length} · {fmtElapsed(elapsedSec)}</span>
          <button className="primary" onClick={finishTiming}>Finish</button>
        </div>
      )}

      {mode === 'steps' ? (
        <StepStack steps={steps} currentIndex={clampedIndex} onPrev={handlePrev} onNext={handleNext} />
      ) : (
        <Timeline
          steps={steps}
          currentIndex={clampedIndex}
          onSelect={(i) => { setIndex(i); setMode('steps') }}
        />
      )}

      {voice.listening && (
        <div className="viewer-heard muted">
          {voice.lastHeard ? `heard: “${voice.lastHeard}”` : 'Listening… say “next”, “previous”, or “full recipe”'}
        </div>
      )}

      {namePrompt && (
        <div className="name-prompt-overlay" onClick={() => setNamePrompt(null)}>
          <div className="name-prompt" onClick={(e) => e.stopPropagation()}>
            <p>Name this variant</p>
            <input
              className="field-input"
              autoFocus
              placeholder="e.g. Alice"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmVariantName() }}
            />
            <div className="editor-actions">
              <button onClick={() => setNamePrompt(null)}>Cancel</button>
              <button className="primary" onClick={confirmVariantName}>Create & save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
