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
import { IngredientsView } from './components/IngredientsView'
import { formatTimeSplit, recipeTime } from './lib/timing'
import { loadMisePref, misePrepFirst, prepStepIds, saveMisePref } from './lib/prep'

interface Props {
  onExit: () => void
  onCookMeal: () => void
}

// 'ingredients' is the default landing view for a recipe; 'cook' walks the steps.
type Mode = 'ingredients' | 'cook' | 'timeline' | 'edit' | 'review'

function toStepView(step: CookStep, recipe: Recipe, prep?: boolean): StepView {
  return {
    description: step.description,
    duration_min: step.duration_min,
    active: step.active,
    tools: step.tools,
    ingredients: step.ingredients,
    recipeName: recipe.name,
    recipeIcon: recipe.icon,
    prep,
  }
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Offline recipe viewer: walk a recipe (or one of its saved variants) step by
// step, edit it, and time your real pace — all persisted locally, no network.
export function Viewer({ onExit, onCookMeal }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [listEditMode, setListEditMode] = useState(false)
  const [variants, setVariants] = useState<RecipeVariant[]>([])
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('ingredients')
  const [mise, setMise] = useState(loadMisePref)

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
  // The order Cook mode walks: as written, or prep steps first (mise en place).
  const orderedSteps: CookStep[] = useMemo(
    () => (mise ? misePrepFirst(effectiveSteps) : effectiveSteps),
    [mise, effectiveSteps],
  )
  const prepIds = useMemo(() => prepStepIds(effectiveSteps), [effectiveSteps])
  const steps: StepView[] = useMemo(
    () => (recipe ? orderedSteps.map((s) => toStepView(s, recipe, mise && prepIds.has(s.id))) : []),
    [orderedSteps, recipe, mise, prepIds],
  )
  const variantLabel = activeVariant?.name ?? 'Original'
  // Planned time for this recipe alone, split the way recipes state it.
  const time = useMemo(() => recipeTime(effectiveSteps).split, [effectiveSteps])

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
    setMode(edit ? 'edit' : 'ingredients')
  }

  const closeRecipe = () => {
    setRecipe(null)
    setMode('ingredients')
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
    if (timingOn && timingStartMs != null && orderedSteps[clampedIndex]) {
      const sec = (Date.now() - timingStartMs) / 1000
      setActuals((a) => ({ ...a, [orderedSteps[clampedIndex].id]: sec }))
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
      case 'cook': setMode('cook'); break
      case 'ingredients': setMode('ingredients'); break
    }
  }

  const voice = useVoiceCommands(handleCommand)

  const startTiming = () => {
    setMode('cook')
    setIndex(0)
    setActuals({})
    setTimingOn(true)
    setTimingStartMs(Date.now())
  }

  const finishTiming = () => {
    if (timingStartMs != null && orderedSteps[clampedIndex]) {
      const sec = (Date.now() - timingStartMs) / 1000
      setActuals((a) => ({ ...a, [orderedSteps[clampedIndex].id]: sec }))
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
      setMode('cook')
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
      setMode('cook')
      resetTiming()
    }
    if (activeVariant) apply(activeVariant)
    else requestVariant(apply)
  }

  const requestVariant = (onCreate: (v: RecipeVariant) => void) => {
    // The name-prompt overlay renders in the cook/ingredients view, so leave
    // edit/review mode first — otherwise the prompt would be invisible.
    setMode('cook')
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
        <button className="cook-meal-btn" onClick={onCookMeal}>🍲 Cook a meal (multiple recipes) →</button>
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
        onCancel={() => setMode('cook')}
      />
    )
  }

  // ---------- Timing review ----------
  if (mode === 'review') {
    return (
      <div className="viewer">
        <header className="viewer-header">
          <button className="link" onClick={() => { setMode('cook'); resetTiming() }}>← Back</button>
          <h1>{recipe.icon} {recipe.name}</h1>
        </header>
        <TimingReview
          steps={effectiveSteps}
          actuals={actuals}
          onSave={saveTimings}
          onDiscard={() => { setMode('cook'); resetTiming() }}
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
        </div>
      </header>

      <VariantBar
        base={recipe}
        variants={variants}
        activeVariantId={activeVariantId}
        onSelect={selectVariant}
        onChange={() => reloadVariants(recipe.name)}
      />

      <div className="view-tabs">
        <button className={mode === 'ingredients' ? 'on' : ''} onClick={() => setMode('ingredients')}>Ingredients</button>
        <button className={mode === 'cook' ? 'on' : ''} onClick={() => setMode('cook')}>Cook</button>
        <button className={mode === 'timeline' ? 'on' : ''} onClick={() => setMode('timeline')}>Full recipe</button>
      </div>

      {mode !== 'ingredients' && prepIds.size > 0 && (
        <label className="mise-toggle">
          <input
            type="checkbox"
            checked={mise}
            disabled={timingOn}
            onChange={(e) => { setMise(e.target.checked); saveMisePref(e.target.checked); setIndex(0) }}
          />
          <span>
            🔪 <strong>Mise en place first</strong>
            <span className="muted"> — {prepIds.size} prep step{prepIds.size === 1 ? '' : 's'} up front</span>
          </span>
        </label>
      )}

      {timingOn && (
        <div className="timing-banner">
          <span>⏱ Timing · step {clampedIndex + 1}/{steps.length} · {fmtElapsed(elapsedSec)}</span>
          <button className="primary" onClick={finishTiming}>Finish</button>
        </div>
      )}

      {mode === 'ingredients' ? (
        <IngredientsView steps={effectiveSteps} time={time} onStartCooking={() => setMode('cook')} />
      ) : mode === 'cook' ? (
        <StepStack steps={steps} currentIndex={clampedIndex} onPrev={handlePrev} onNext={handleNext} />
      ) : (
        <Timeline
          steps={steps}
          currentIndex={clampedIndex}
          totalLabel={formatTimeSplit(time)}
          onSelect={(i) => { setIndex(i); setMode('cook') }}
        />
      )}

      {voice.listening && (
        <div className="viewer-heard muted">
          {voice.lastHeard ? `heard: “${voice.lastHeard}”` : 'Listening… say “next”, “cook”, “ingredients”, or “full recipe”'}
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
