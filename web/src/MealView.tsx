import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CookStep, KitchenPreset, Recipe, RecipeVariant, ScheduleStep, StepView } from './types'
import { recipeColor, type RecipeColor } from './lib/recipeColors'
import { useKeepAwake } from './lib/useKeepAwake'
import { useVoiceCommands } from './lib/useVoiceCommands'
import type { VoiceCommand } from './lib/voiceGrammar'
import { cloneSteps, createVariant, listVariants, updateVariant } from './lib/variantStore'
import { scheduleMeal } from './lib/schedulerProvider'
import { formatTimeSplit, mealTimeSplit } from './lib/timing'
import { loadMisePref, prepStepIds, saveMisePref } from './lib/prep'
import { StepStack } from './components/StepStack'
import { MealIngredients } from './components/MealIngredients'
import { ScheduleGraph } from './components/ScheduleGraph'
import { SideBySide } from './components/SideBySide'
import { BackgroundRail } from './components/BackgroundRail'
import { VariantBar } from './components/VariantBar'
import { RecipeEditor } from './components/RecipeEditor'
import { TimingReview } from './components/TimingReview'

interface Props {
  recipes: Recipe[] // the bundled originals; variants are picked in here
  kitchen: KitchenPreset
  timingEnabled: boolean // show the ⏱ button (off by default; set on the recipe list)
  onExit: () => void // back to the recipe list
}

type Mode = 'ingredients' | 'cook' | 'sbs' | 'gantt' | 'edit' | 'review'

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
    prep: s.prep,
  }
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Schedule step ids are "<recipe index>:<step id>" (see scheduleRecipes).
function splitStepId(id: string): [number, string] {
  const at = id.indexOf(':')
  return [Number(id.slice(0, at)), id.slice(at + 1)]
}

// One or more recipes, planned for one cook: Ingredients (merged, plus each
// recipe's variant picker and edit button) / Cook (steps in schedule order +
// background rail) / Side by side (a column per recipe) / Overview (the whole
// interleaved schedule). Switching a variant,
// editing, or toggling mise en place re-plans on the spot. Timing mode records
// your real pace on the hands-on steps and saves it into each recipe's variant.
// Fully offline; variants persist in localStorage.
export function MealView({ recipes, kitchen, timingEnabled, onExit }: Props) {
  const [mode, setMode] = useState<Mode>('ingredients')
  const [index, setIndex] = useState(0)
  const [mise, setMise] = useState(loadMisePref)
  const [variants, setVariants] = useState<RecipeVariant[][]>(() => recipes.map((r) => listVariants(r.name)))
  const [variantIds, setVariantIds] = useState<(string | null)[]>(() => recipes.map(() => null))
  const [editIdx, setEditIdx] = useState(0)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set()) // Side by side

  // Timing state. Actuals are seconds per schedule step id.
  const [timingOn, setTimingOn] = useState(false)
  const [timingStartMs, setTimingStartMs] = useState<number | null>(null)
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())

  // Name prompt for creating variants when saving edits/timings off Original.
  const [namePrompt, setNamePrompt] = useState<{ onName: (name: string) => void } | null>(null)
  const [promptValue, setPromptValue] = useState('')

  useKeepAwake(true)

  useEffect(() => {
    if (!timingOn) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timingOn])

  const activeVariants = useMemo(
    () => recipes.map((_, i) => variants[i].find((v) => v.id === variantIds[i]) ?? null),
    [recipes, variants, variantIds],
  )
  // Each recipe with its chosen variant's steps.
  const effective: Recipe[] = useMemo(
    () => recipes.map((r, i) => ({ ...r, cookSteps: activeVariants[i]?.cookSteps ?? r.cookSteps })),
    [recipes, activeVariants],
  )
  const prepCount = useMemo(
    () => effective.reduce((n, r) => n + prepStepIds(r.cookSteps).size, 0),
    [effective],
  )

  const planned = useMemo(() => {
    try {
      const opts = { miseEnPlace: mise }
      const plan = scheduleMeal(effective, kitchen, 1, opts)
      return { ...plan, time: mealTimeSplit(plan.schedule, effective, kitchen, 1, opts), error: null }
    } catch (e) {
      return { schedule: null, source: 'local' as const, time: null, error: String((e as Error).message ?? e) }
    }
  }, [effective, kitchen, mise])
  const schedule = planned.schedule

  const colorByRecipe = useMemo(() => {
    const m: Record<string, RecipeColor> = {}
    recipes.forEach((r, i) => (m[r.name] = recipeColor(i)))
    return m
  }, [recipes])

  // Cook mode walks every step in schedule order (so "preheat the oven" shows
  // up as the first thing you do, not only in the background rail).
  const orderedSteps = useMemo(() => schedule?.steps ?? [], [schedule])
  const passiveSteps = useMemo(() => orderedSteps.filter((s) => !s.active), [orderedSteps])
  const stepViews = useMemo(
    () => orderedSteps.map((s) => toStepView(s, colorByRecipe[s.recipe]?.accent, schedule?.icons[s.recipe])),
    [orderedSteps, colorByRecipe, schedule],
  )
  // Combined hands-on time for the ingredients view (active steps only).
  const activeMin = useMemo(
    () => orderedSteps.filter((s) => s.active).reduce((n, s) => n + s.duration_min, 0),
    [orderedSteps],
  )

  const clampedIndex = stepViews.length ? Math.min(Math.max(0, index), stepViews.length - 1) : 0
  const cur = orderedSteps[clampedIndex]

  const resetTiming = () => {
    setTimingOn(false)
    setTimingStartMs(null)
    setActuals({})
  }

  // Record the current step's elapsed time — hands-on steps only: a passive
  // step (preheat, simmer) is tapped past while it runs, so its gap means nothing.
  const recordCurrent = () => {
    if (timingStartMs == null || !cur?.active) return
    const sec = (Date.now() - timingStartMs) / 1000
    setActuals((a) => ({ ...a, [cur.step_id]: sec }))
  }

  const goNext = () => {
    if (timingOn) {
      recordCurrent()
      if (clampedIndex < stepViews.length - 1) {
        setIndex(clampedIndex + 1)
        setTimingStartMs(Date.now())
      } else {
        setTimingOn(false)
        setMode('review')
      }
      return
    }
    setIndex((i) => Math.min(i + 1, stepViews.length - 1))
  }
  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
    if (timingOn) setTimingStartMs(Date.now())
  }, [timingOn])

  const startTiming = () => {
    setMode('cook')
    setIndex(0)
    setActuals({})
    setTimingOn(true)
    setTimingStartMs(Date.now())
  }
  const finishTiming = () => {
    recordCurrent()
    setTimingOn(false)
    setMode('review')
  }

  const handleCommand = (cmd: VoiceCommand) => {
    if (mode === 'edit' || mode === 'review') return
    switch (cmd) {
      case 'next': goNext(); break
      case 'prev': goPrev(); break
      case 'cook': setMode('cook'); break
      case 'ingredients': setMode('ingredients'); break
      case 'columns': setMode('sbs'); break
      case 'timeline': setMode('gantt'); break
    }
  }
  const voice = useVoiceCommands(handleCommand)

  // ---------- Variants ----------
  const reloadVariants = (i: number) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? listVariants(recipes[i].name) : v)))

  const selectVariant = (i: number, id: string | null) => {
    setVariantIds((ids) => ids.map((v, j) => (j === i ? id : v)))
    setIndex(0)
    resetTiming()
  }

  // Run `apply` on each listed recipe's variant, first creating variants
  // (one shared name, asked once) for any recipe still on Original.
  const withVariants = (idxs: number[], apply: (i: number, v: RecipeVariant) => void) => {
    const run = (name: string | null) => {
      for (const i of idxs) {
        const v = activeVariants[i] ?? createVariant(recipes[i], name!)
        apply(i, v)
        reloadVariants(i)
        setVariantIds((ids) => ids.map((x, j) => (j === i ? v.id : x)))
      }
    }
    if (idxs.every((i) => activeVariants[i])) run(null)
    else {
      setPromptValue('')
      setNamePrompt({ onName: run })
    }
  }

  const saveEditedSteps = (newSteps: CookStep[]) => {
    const copy = cloneSteps(newSteps)
    setMode('ingredients')
    withVariants([editIdx], (_, v) => updateVariant({ ...v, cookSteps: copy }))
  }

  // Timed durations come back keyed by schedule step id; only timed steps change.
  const saveTimings = (durMap: Record<string, number>) => {
    const byRecipe = new Map<number, Record<string, number>>()
    for (const id of Object.keys(actuals)) {
      const [i, stepId] = splitStepId(id)
      byRecipe.set(i, { ...byRecipe.get(i), [stepId]: durMap[id] })
    }
    setMode('cook')
    resetTiming()
    withVariants([...byRecipe.keys()], (i, v) => {
      const d = byRecipe.get(i)!
      updateVariant({ ...v, cookSteps: v.cookSteps.map((s) => ({ ...s, duration_min: d[s.id] ?? s.duration_min })) })
    })
  }

  const confirmName = () => {
    const name = promptValue.trim()
    if (!namePrompt || !name) return
    namePrompt.onName(name)
    setNamePrompt(null)
  }

  const nameOverlay = namePrompt && (
    <div className="name-prompt-overlay" onClick={() => setNamePrompt(null)}>
      <div className="name-prompt" onClick={(e) => e.stopPropagation()}>
        <p>Name this variant</p>
        <input
          className="field-input"
          autoFocus
          placeholder="e.g. Alice"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmName() }}
        />
        <div className="editor-actions">
          <button onClick={() => setNamePrompt(null)}>Cancel</button>
          <button className="primary" onClick={confirmName}>Create & save</button>
        </div>
      </div>
    </div>
  )

  const title = recipes.length === 1 ? `${recipes[0].icon ?? '🍽️'} ${recipes[0].name}` : `Meal · ${recipes.length} recipes`

  // ---------- Editing ----------
  if (mode === 'edit') {
    const r = effective[editIdx]
    return (
      <RecipeEditor
        recipeName={r.name}
        recipeIcon={r.icon}
        variantLabel={activeVariants[editIdx]?.name ?? 'Original'}
        steps={r.cookSteps}
        onDone={saveEditedSteps}
        onCancel={() => setMode('ingredients')}
      />
    )
  }

  // ---------- Timing review ----------
  if (mode === 'review') {
    // Written durations from the recipes themselves (not the substituted plan),
    // in the order you cooked them.
    const reviewSteps: CookStep[] = orderedSteps.map((s) => {
      const [i, stepId] = splitStepId(s.step_id)
      const step = effective[i].cookSteps.find((c) => c.id === stepId)!
      const icon = recipes.length > 1 ? `${recipes[i].icon ?? ''} ` : ''
      return { ...step, id: s.step_id, description: icon + step.description }
    })
    return (
      <div className="viewer">
        <header className="viewer-header">
          <button className="link" onClick={() => { setMode('cook'); resetTiming() }}>← Back</button>
          <h1>{title}</h1>
        </header>
        <TimingReview
          steps={reviewSteps}
          actuals={actuals}
          onSave={saveTimings}
          onDiscard={() => { setMode('cook'); resetTiming() }}
        />
        {nameOverlay}
      </div>
    )
  }

  const elapsedSec = timingStartMs != null ? Math.max(0, (now - timingStartMs) / 1000) : 0

  return (
    <div className="viewer">
      <header className="viewer-header">
        <button className="link" onClick={() => { void voice.stop(); onExit() }}>← Recipes</button>
        <h1>{title}</h1>
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
          {schedule && timingEnabled && (
            <button
              className={timingOn ? 'mic active' : ''}
              onClick={() => (timingOn ? finishTiming() : startTiming())}
              title={timingOn ? 'Finish timing' : 'Start timing'}
            >
              ⏱
            </button>
          )}
        </div>
      </header>
      {planned.time && (
        <div className="meal-subhead muted">
          total {formatTimeSplit(planned.time)}
          {planned.source === 'remote' && ' · planned online'}
        </div>
      )}

      <div className="view-tabs">
        <button className={mode === 'ingredients' ? 'on' : ''} onClick={() => setMode('ingredients')}>Ingredients</button>
        <button className={mode === 'cook' ? 'on' : ''} onClick={() => setMode('cook')}>Cook</button>
        <button className={mode === 'sbs' ? 'on' : ''} onClick={() => setMode('sbs')}>Side by side</button>
        <button className={mode === 'gantt' ? 'on' : ''} onClick={() => setMode('gantt')}>Overview</button>
      </div>

      {prepCount > 0 && (
        <label className="mise-toggle">
          <input
            type="checkbox"
            checked={mise}
            disabled={timingOn}
            onChange={(e) => { setMise(e.target.checked); saveMisePref(e.target.checked); setIndex(0) }}
          />
          <span>
            🔪 <strong>Mise en place first</strong>
            <span className="muted"> — {prepCount} prep step{prepCount === 1 ? '' : 's'} before anything goes on the heat</span>
          </span>
        </label>
      )}

      {timingOn && (
        <div className="timing-banner">
          <span>⏱ Timing · step {clampedIndex + 1}/{stepViews.length} · {fmtElapsed(elapsedSec)}</span>
          <button className="primary" onClick={finishTiming}>Finish</button>
        </div>
      )}

      {mode === 'ingredients' && (
        <>
          {recipes.map((r, i) => (
            <div className="meal-recipe-row" key={r.name}>
              {recipes.length > 1 && (
                <div className="meal-recipe-name" style={{ color: recipeColor(i).accent }}>
                  {r.icon ?? '🍽️'} {r.name}
                </div>
              )}
              <div className="meal-recipe-controls">
                <VariantBar
                  base={r}
                  variants={variants[i]}
                  activeVariantId={variantIds[i]}
                  onSelect={(id) => selectVariant(i, id)}
                  onChange={() => reloadVariants(i)}
                />
                <button
                  className="meal-recipe-edit"
                  onClick={() => { setEditIdx(i); setMode('edit') }}
                  title={`Edit ${r.name}`}
                >
                  ✏️
                </button>
              </div>
            </div>
          ))}
          {planned.error && <p className="error">{planned.error}</p>}
          {planned.time && <MealIngredients recipes={effective} time={planned.time} activeMin={activeMin} />}
          {schedule && (
            <button className="primary start-cooking" onClick={() => setMode('cook')}>
              Start cooking →
            </button>
          )}
        </>
      )}
      {mode === 'cook' && schedule && (
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
      {mode === 'sbs' && schedule && (
        <SideBySide
          steps={orderedSteps}
          recipes={recipes}
          colors={colorByRecipe}
          hidden={hiddenCols}
          onToggle={(name) =>
            setHiddenCols((h) => {
              const n = new Set(h)
              if (n.has(name)) n.delete(name)
              else n.add(name)
              return n
            })
          }
          currentIndex={clampedIndex}
          onSelect={(i) => { setIndex(i); setMode('cook') }}
        />
      )}
      {mode === 'gantt' && schedule && planned.time && (
        <ScheduleGraph
          steps={orderedSteps}
          recipes={recipes}
          colors={colorByRecipe}
          totalLabel={formatTimeSplit(planned.time)}
          currentIndex={clampedIndex}
          onSelect={(i) => { setIndex(i); setMode('cook') }}
        />
      )}
      {mode !== 'ingredients' && planned.error && <p className="error">{planned.error}</p>}

      {voice.listening && (
        <div className="viewer-heard muted">
          {voice.lastHeard ? `heard: “${voice.lastHeard}”` : 'Listening… say “next”, “cook”, “ingredients”, “side by side”, or “overview”'}
        </div>
      )}
      {nameOverlay}
    </div>
  )
}
