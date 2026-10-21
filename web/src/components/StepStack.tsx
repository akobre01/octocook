import type { StepView } from '../types'
import { StepCard, type StepEmphasis } from './StepCard'

interface Props {
  steps: StepView[]
  currentIndex: number
  onPrev: () => void
  onNext: () => void
}

// Shows a window of up to five steps: the current step (emphasized) plus
// surrounding steps that fade progressively grayer (past) or lighter
// (upcoming). The window always stays full when the recipe has >= 5 steps —
// near the ends it slides so we still show five, rather than shrinking.
// Requirement #2, relaxed from three to five so the screen isn't mostly empty.
function emphasisFor(distance: number): StepEmphasis {
  if (distance === 0) return 'current'
  if (distance === -1) return 'prev'
  if (distance === -2) return 'prev2'
  if (distance <= -3) return 'prev3'
  if (distance === 1) return 'next'
  if (distance === 2) return 'next2'
  return 'next3'
}

export function StepStack({ steps, currentIndex, onPrev, onNext }: Props) {
  const total = steps.length

  // A full window of up to five steps, slid to stay within bounds so the end
  // of a recipe still shows five (the current step + its predecessors).
  const size = Math.min(5, total)
  const from = Math.max(0, Math.min(currentIndex - 2, total - size))
  const to = from + size - 1
  const window: number[] = []
  for (let i = from; i <= to; i++) window.push(i)

  return (
    <div className="step-stack">
      <div className="step-stack-cards">
        {from === 0 && <div className="step-placeholder">Start of recipe</div>}

        {window.map((i) => (
          <StepCard
            key={i}
            step={steps[i]}
            emphasis={emphasisFor(i - currentIndex)}
            position={{ index: i + 1, total }}
          />
        ))}

        {to === total - 1 && <div className="step-placeholder">End of recipe</div>}
      </div>

      <div className="step-stack-nav">
        <button onClick={onPrev} disabled={currentIndex === 0}>
          ← Previous
        </button>
        <span className="step-stack-counter">
          {currentIndex + 1} / {total}
        </span>
        <button className="primary" onClick={onNext} disabled={currentIndex >= total - 1}>
          Next →
        </button>
      </div>
    </div>
  )
}
