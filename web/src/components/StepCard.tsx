import type { ReactNode } from 'react'
import type { StepView } from '../types'
import { ToolIcons } from './ToolIcon'

// Emphasis tiers, from most-faded past to upcoming preview. The further a step
// is from the current one, the grayer (past) or lighter (upcoming) it renders.
export type StepEmphasis =
  | 'prev3'
  | 'prev2'
  | 'prev'
  | 'current'
  | 'next'
  | 'next2'
  | 'next3'

interface Props {
  step: StepView
  // Visual weight. 'current' is large/emphasized, 'prev' is dimmed/done-looking,
  // 'next' is a lighter preview. Undefined = neutral (e.g. inside CookView).
  emphasis?: StepEmphasis
  // 1-based position within its sequence, shown as "Step X of Y".
  position?: { index: number; total: number }
  // Optional action slot rendered at the bottom (CookView passes its
  // timer/Start/Done/blocker chrome here; the viewer passes nothing).
  children?: ReactNode
}

// Presentational core shared by the offline Viewer and the scheduler CookView.
// Pure: it renders a StepView and an optional action slot, nothing more.
export function StepCard({ step, emphasis, position, children }: Props) {
  const kind = step.active ? 'active' : 'passive'
  const classes = ['step-card', kind]
  if (emphasis) classes.push(emphasis)

  return (
    <div className={classes.join(' ')}>
      <div className="step-head">
        {step.recipeIcon && <span className="step-icon">{step.recipeIcon}</span>}
        <div className="step-meta">
          {(step.recipeName || !step.active) && (
            <div className="step-recipe">
              {step.recipeName}
              {!step.active && <span className="passive-tag">hands-off</span>}
            </div>
          )}
          <div className="step-positions">
            {position && <span>Step {position.index}/{position.total}</span>}
            {position && <span className="dot">·</span>}
            <span>~ {step.duration_min} min</span>
          </div>
        </div>
        {step.tools.length > 0 && <ToolIcons tools={step.tools} />}
      </div>

      <div className="step-desc">{step.description}</div>

      {step.ingredients && step.ingredients.length > 0 && (
        <ul className="step-ingredients">
          {step.ingredients.map((ing, i) => (
            <li key={i}>{ing}</li>
          ))}
        </ul>
      )}

      {children}
    </div>
  )
}
