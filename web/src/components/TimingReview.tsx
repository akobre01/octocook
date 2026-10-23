import type { CookStep } from '../types'

interface Props {
  steps: CookStep[]
  // Measured seconds per step id from the timing run.
  actuals: Record<string, number>
  onSave: (durationMinByStepId: Record<string, number>) => void
  onDiscard: () => void
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// After a timing run, compare the recipe's written duration for each step with
// what the cook actually took, and offer to save the real times (rounded to
// whole minutes, min 1) as the active variant's durations.
export function TimingReview({ steps, actuals, onSave, onDiscard }: Props) {
  const save = () => {
    const out: Record<string, number> = {}
    for (const s of steps) {
      const sec = actuals[s.id]
      out[s.id] = sec != null ? Math.max(1, Math.round(sec / 60)) : s.duration_min
    }
    onSave(out)
  }

  const measured = steps.filter((s) => actuals[s.id] != null)
  const totalWritten = measured.reduce((n, s) => n + s.duration_min, 0)
  const totalActual = measured.reduce((n, s) => n + actuals[s.id], 0)

  return (
    <div className="timing-review">
      <h2>Your timings</h2>
      <p className="muted">Written estimate vs. your real pace. Save to use your times for this variant.</p>

      <table className="timing-table">
        <thead>
          <tr><th>#</th><th>Step</th><th>Written</th><th>You</th><th>Δ</th></tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const sec = actuals[s.id]
            const timed = sec != null
            const deltaMin = timed ? sec / 60 - s.duration_min : 0
            return (
              <tr key={s.id} className={timed ? '' : 'untimed'}>
                <td>{i + 1}</td>
                <td className="tr-desc">{s.description || <em className="muted">(empty)</em>}</td>
                <td>{s.duration_min}m</td>
                <td>{timed ? fmt(sec) : '—'}</td>
                <td className={deltaMin > 0 ? 'over' : deltaMin < 0 ? 'under' : ''}>
                  {timed ? `${deltaMin > 0 ? '+' : ''}${deltaMin.toFixed(1)}m` : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td></td><td>Total (timed)</td>
            <td>{totalWritten}m</td>
            <td>{fmt(totalActual)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className="editor-actions">
        <button onClick={onDiscard}>Discard</button>
        <button className="primary" onClick={save} disabled={measured.length === 0}>
          Save my timings
        </button>
      </div>
    </div>
  )
}
