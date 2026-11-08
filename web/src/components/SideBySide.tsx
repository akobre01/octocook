import { useEffect, useRef } from 'react'
import type { ScheduleStep } from '../types'
import type { RecipeColor } from '../lib/recipeColors'
import { primaryTool } from '../lib/toolIcons'
import { ToolIcon } from './ToolIcon'

interface Props {
  steps: ScheduleStep[] // the whole meal, in schedule order
  recipes: { name: string; icon?: string }[]
  colors: Record<string, RecipeColor> // recipe name -> color
  hidden: Set<string> // recipe names whose column is hidden
  onToggle: (name: string) => void
  currentIndex: number // Cook mode's position in `steps`
  onSelect: (index: number) => void // tap a step to jump there in Cook
}

type StepState = 'done' | 'current' | 'running' | 'next' | 'later'

// One column per recipe, its steps top to bottom in the order you'll cook
// them; columns sit side by side and scroll horizontally when there are many.
// Each column is highlighted from Cook mode's position: the step you're on,
// anything of that recipe still running alongside it (a bake, a simmer), and
// the recipe's next step. Columns are half the screen wide so two always fit:
// long steps are clamped to a few lines (the current and next step show in
// full) and hands-off steps get a ⏳ instead of a label. Each step shows the
// icon of the tool it needs, so a column can be skimmed without reading.
export function SideBySide({ steps, recipes, colors, hidden, onToggle, currentIndex, onSelect }: Props) {
  const cur = steps[currentIndex]
  const currentRef = useRef<HTMLLIElement | null>(null)

  // Bring the current step into view when the tab opens.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])

  const stateOf = (s: ScheduleStep, i: number, firstNext: number): StepState => {
    if (i === currentIndex) return 'current'
    if (cur && i < currentIndex) {
      return s.end_min > cur.start_min ? 'running' : 'done'
    }
    return i === firstNext ? 'next' : 'later'
  }

  const shown = recipes.filter((r) => !hidden.has(r.name))

  return (
    <div className="sbs">
      {recipes.length > 1 && (
        <div className="sbs-toggles">
          {recipes.map((r) => (
            <label key={r.name} className="sbs-toggle" style={{ borderColor: colors[r.name]?.accent }}>
              <input type="checkbox" checked={!hidden.has(r.name)} onChange={() => onToggle(r.name)} />
              <span>{r.icon ?? '🍽️'} {r.name}</span>
            </label>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted">All recipes are hidden — tick one above to show it.</p>
      ) : (
        <div className="sbs-scroll">
          {shown.map((r) => {
            const c = colors[r.name]
            const mine = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.recipe === r.name)
            const firstNext = mine.find(({ i }) => i > currentIndex)?.i ?? -1
            return (
              <section className="sbs-col" key={r.name}>
                <header className="sbs-col-head" style={{ color: c?.accent, borderColor: c?.accent }}>
                  <span className="sbs-col-icon">{r.icon ?? '🍽️'}</span>
                  <span className="sbs-col-name">{r.name}</span>
                </header>
                <ol className="sbs-steps">
                  {mine.map(({ s, i }, n) => {
                    const state = stateOf(s, i, firstNext)
                    return (
                      <li
                        key={s.step_id}
                        ref={state === 'current' ? currentRef : undefined}
                        className={`sbs-step ${state}${s.active ? '' : ' passive'}`}
                        style={state === 'current' || state === 'next' ? { borderColor: c?.accent } : undefined}
                        onClick={() => onSelect(i)}
                      >
                        <div className="sbs-step-head">
                          <span className="sbs-step-clock">{n + 1} · {s.start_clock}</span>
                          {state === 'current' && <span className="sbs-tag">now</span>}
                          {state === 'running' && <span className="sbs-tag">on</span>}
                          {state === 'next' && <span className="sbs-tag">next</span>}
                          <span className="sbs-step-min">
                            {!s.active && <span title="hands-off">⏳</span>}
                            {s.duration_min}m
                          </span>
                        </div>
                        <div className="sbs-step-body">
                          <div className="sbs-step-desc">{s.description}</div>
                          {primaryTool(s.tools) && <ToolIcon tool={primaryTool(s.tools)!} className="sbs-step-tool" />}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
