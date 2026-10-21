import type { StepView } from '../types'
import { ToolIcon } from './ToolIcon'

interface Props {
  steps: StepView[]
  currentIndex: number
  onSelect: (index: number) => void
}

// The "full recipe" view (requirement #4): a vertical list of every step with
// its number, tool icon, and one-line (truncated) description. A small bar
// under each row is sized proportionally to the step's duration, preserving the
// "how long does this take" cue from the original horizontal timeline while
// using the screen's vertical space for readable text. Tapping a row jumps to
// that step.
export function Timeline({ steps, currentIndex, onSelect }: Props) {
  const totalMin = steps.reduce((sum, s) => sum + Math.max(1, s.duration_min), 0)
  const maxMin = Math.max(1, ...steps.map((s) => s.duration_min))

  return (
    <div className="vtimeline">
      <div className="vtimeline-caption muted">
        Total ~ {totalMin} min · tap a step to jump
      </div>
      <ol className="vtimeline-list">
        {steps.map((step, i) => {
          const classes = ['vtimeline-row', step.active ? 'active' : 'passive']
          if (i === currentIndex) classes.push('current')
          const lead = step.tools[0]
          const barPct = (Math.max(1, step.duration_min) / maxMin) * 100
          return (
            <li key={i}>
              <button className={classes.join(' ')} onClick={() => onSelect(i)}>
                <span className="vrow-num">{i + 1}</span>
                <span className="vrow-icon">{lead && <ToolIcon tool={lead} />}</span>
                <span className="vrow-body">
                  <span className="vrow-desc">{step.description}</span>
                  <span className="vrow-bar" style={{ width: `${barPct}%` }} />
                </span>
                <span className="vrow-min">~{step.duration_min}m</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
