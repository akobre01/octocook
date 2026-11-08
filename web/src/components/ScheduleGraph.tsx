import type { ScheduleStep } from '../types'
import type { RecipeColor } from '../lib/recipeColors'
import { primaryTool } from '../lib/toolIcons'
import { ToolIcon } from './ToolIcon'

interface Props {
  steps: ScheduleStep[] // scheduled, sorted by start_min
  recipes: { name: string; icon?: string }[] // for the color legend
  colors: Record<string, RecipeColor> // recipe -> color
  totalLabel: string // e.g. "~ 1 hr 10 min · +1 hr cooling"
  currentIndex: number
  onSelect: (index: number) => void // tap a card to jump there in Cook
}

// Width of one rail column in the left gutter, px.
const RAIL_W = 16

type Seg = 'none' | 'through' | 'branch' | 'end'

interface CardRow {
  kind: 'card'
  step: ScheduleStep
  index: number
  segs: Seg[] // one per rail column to the card's left (its indent)
  colors: (string | undefined)[]
}

interface EndRow {
  kind: 'end'
  step: ScheduleStep
  segs: Seg[]
  colors: (string | undefined)[]
}

type Row = CardRow | EndRow

// "Preheat oven to 350°F" → "Oven ready (350°F)"; anything else → the
// description up to its "until"/"("/";", marked done ("Toast — done").
function endLabel(s: ScheduleStep): string {
  if (/preheat/i.test(s.description)) {
    const temp = /\d{3}\s*°\s*[FC]?/.exec(s.description)?.[0]
    return temp ? `Oven ready (${temp.replace(/\s/g, '')})` : 'Oven ready'
  }
  const head = s.description.split(/\s+until\b|\s*[(;]/i)[0].trim()
  return `${head || s.description} — done`
}

// Lay the schedule out like a git graph. Cards are in start order. A step
// that's still going when a later card starts (a preheat, a simmer) gets a
// rail: a line in its recipe's color running down the gutter from its card to
// an end row where it finishes. Cards are indented past every open rail, with
// a branch off the nearest one — so "chop while the oven heats" sits under the
// preheat. Rails keep their column until they end; because ends are rows of
// their own, overlaps that don't nest (the oven is ready before the marinade
// is done) read correctly.
function layout(steps: ScheduleStep[], colors: Record<string, RecipeColor>): Row[] {
  const needsRail = steps.map((s, i) => steps.slice(i + 1).some((t) => t.start_min < s.end_min))

  // Starts, plus an end for each railed step; at equal times, ends first so a
  // step that begins as another finishes isn't indented under it.
  type Ev = { t: number; end: boolean; i: number }
  const events: Ev[] = steps.map((s, i) => ({ t: s.start_min, end: false, i }))
  steps.forEach((s, i) => { if (needsRail[i]) events.push({ t: s.end_min, end: true, i }) })
  events.sort((a, b) => a.t - b.t || Number(b.end) - Number(a.end) || a.i - b.i)

  const rails: (number | null)[] = [] // column -> step index, or free
  const highestOpen = () => {
    for (let c = rails.length - 1; c >= 0; c--) if (rails[c] !== null) return c
    return -1
  }
  const railColor = (c: number) => {
    const i = rails[c]
    return i == null ? undefined : colors[steps[i].recipe]?.accent
  }

  const rows: Row[] = []
  for (const ev of events) {
    const s = steps[ev.i]
    if (ev.end) {
      const col = rails.indexOf(ev.i)
      const width = highestOpen() + 1
      const segs: Seg[] = []
      const cs: (string | undefined)[] = []
      for (let c = 0; c < width; c++) {
        segs.push(c === col ? 'end' : rails[c] !== null ? 'through' : 'none')
        cs.push(railColor(c))
      }
      rows.push({ kind: 'end', step: s, segs, colors: cs })
      rails[col] = null
      continue
    }
    const indent = highestOpen() + 1
    const segs: Seg[] = []
    const cs: (string | undefined)[] = []
    for (let c = 0; c < indent; c++) {
      segs.push(rails[c] === null ? 'none' : c === indent - 1 ? 'branch' : 'through')
      cs.push(railColor(c))
    }
    rows.push({ kind: 'card', step: s, index: ev.i, segs, colors: cs })
    if (needsRail[ev.i]) rails[indent] = ev.i
  }
  return rows
}

function Gutter({ segs, colors }: { segs: Seg[]; colors: (string | undefined)[] }) {
  return (
    <>
      {segs.map((seg, c) => (
        <span key={c} className={`graph-rail ${seg}`} style={{ width: RAIL_W, color: colors[c] }} aria-hidden>
          {seg !== 'none' && <span className="graph-rail-line" />}
          {seg === 'branch' && <span className="graph-rail-stub" />}
          {seg === 'end' && <span className="graph-rail-dot" />}
        </span>
      ))}
    </>
  )
}

// Overview: the whole interleaved schedule as one list, with overlapping work
// drawn as rails and indents (see layout). A card's color says which recipe it
// belongs to (see the legend); its icon is the tool it needs.
export function ScheduleGraph({ steps, recipes, colors, totalLabel, currentIndex, onSelect }: Props) {
  const rows = layout(steps, colors)

  return (
    <div className="graph">
      {recipes.length > 1 && (
        <div className="graph-legend">
          {recipes.map((r) => (
            <span key={r.name} className="graph-legend-item" style={{ borderColor: colors[r.name]?.accent }}>
              <span className="graph-legend-swatch" style={{ background: colors[r.name]?.accent }} />
              <span className="graph-legend-name">{r.icon ?? '🍽️'} {r.name}</span>
            </span>
          ))}
        </div>
      )}
      <div className="graph-caption muted">Total {totalLabel} · tap a step to jump</div>
      <ol className="graph-rows">
        {rows.map((row) =>
          row.kind === 'card' ? (
            <li className="graph-row" key={row.step.step_id}>
              <Gutter segs={row.segs} colors={row.colors} />
              <div
                className={`graph-card ${row.step.active ? 'active' : 'passive'}${row.index === currentIndex ? ' current' : ''}`}
                style={{ borderLeftColor: colors[row.step.recipe]?.accent }}
                onClick={() => onSelect(row.index)}
              >
                <div className="graph-card-head">
                  <span className="graph-clock">{row.step.start_clock}</span>
                  <span className="graph-card-min">
                    {!row.step.active && <span title="hands-off">⏳</span>}
                    {row.step.duration_min}m
                  </span>
                </div>
                <div className="graph-card-body">
                  <div className="graph-card-desc">{row.step.description}</div>
                  {primaryTool(row.step.tools) && (
                    <ToolIcon tool={primaryTool(row.step.tools)!} className="graph-card-tool" />
                  )}
                </div>
              </div>
            </li>
          ) : (
            <li className="graph-row end" key={`${row.step.step_id}-end`}>
              <Gutter segs={row.segs} colors={row.colors} />
              <div className="graph-end" style={{ color: colors[row.step.recipe]?.accent }}>
                <span className="graph-clock">{row.step.end_clock}</span>
                <span className="graph-end-label">{endLabel(row.step)}</span>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}
