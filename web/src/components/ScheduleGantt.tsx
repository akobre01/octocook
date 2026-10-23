import type { ScheduleStep } from '../types'
import { recipeColor } from '../lib/recipeColors'

interface Props {
  steps: ScheduleStep[] // scheduled, sorted by start_min
  icons: Record<string, string> // recipe -> icon
}

// Fixed card height so short steps stay readable (NOT time-proportional); the
// gutter bars must use the same numbers to line up.
const CARD_H = 58
const GAP = 8
const LANE_W = 11 // px per concurrency lane in the gutter

// Full-recipe overview: steps as readable cards in schedule order, plus a left
// gutter of vertical bars showing what overlaps. A step's bar spans its own card
// down through every later card it runs concurrently with — so a preheat that
// runs during the next step gets a bar covering both cards. Steps are packed
// into concurrency lanes (lane 0 nearest the cards; later lanes grow leftward),
// each lane its own color (first step alone = color 1; a step that starts while
// one is running = color 2; same lane = same color).
export function ScheduleGantt({ steps, icons }: Props) {
  const makespan = steps.reduce((m, s) => Math.max(m, s.end_min), 0)

  // Greedy lane assignment in schedule order (lowest free lane).
  const laneEnd: number[] = []
  const laneOf = new Map<string, number>()
  for (const s of steps) {
    let L = laneEnd.findIndex((e) => e <= s.start_min)
    if (L === -1) {
      L = laneEnd.length
      laneEnd.push(s.end_min)
    } else {
      laneEnd[L] = s.end_min
    }
    laneOf.set(s.step_id, L)
  }
  const numLanes = Math.max(1, laneEnd.length)

  // How many cards a step's bar covers: itself + later cards that overlap it.
  const spanEnd = (i: number) => {
    let j = i
    for (let k = i + 1; k < steps.length; k++) {
      if (steps[k].start_min < steps[i].end_min) j = k
      else break // sorted by start → no later step overlaps once one starts past the end
    }
    return j
  }

  const totalH = steps.length * (CARD_H + GAP) - GAP

  return (
    <div className="gantt">
      <div className="gantt-caption muted">Total ~ {makespan} min · bars show overlapping work</div>
      <div className="gantt-scroll">
        <div className="gantt-rows">
          <div className="gantt-gutter" style={{ width: `${numLanes * LANE_W}px`, height: `${totalH}px` }}>
            {steps.map((s, i) => {
              const L = laneOf.get(s.step_id) ?? 0
              const j = spanEnd(i)
              const c = recipeColor(L)
              return (
                <span
                  key={s.step_id}
                  className="gantt-gbar"
                  style={{
                    top: `${i * (CARD_H + GAP)}px`,
                    height: `${(j - i + 1) * (CARD_H + GAP) - GAP}px`,
                    left: `${(numLanes - 1 - L) * LANE_W}px`,
                    background: c.accent,
                  }}
                />
              )
            })}
          </div>
          <ol className="gantt-cards">
            {steps.map((s) => (
              <li className={`gantt-card ${s.active ? 'active' : 'passive'}`} key={s.step_id} style={{ height: `${CARD_H}px` }}>
                <div className="gantt-card-head">
                  <span className="gantt-card-clock">{s.start_clock}</span>
                  <span className="gantt-card-icon">{icons[s.recipe] ?? ''}</span>
                  {!s.active && <span className="passive-tag">hands-off</span>}
                  <span className="gantt-card-min">~{s.duration_min}m</span>
                </div>
                <div className="gantt-card-desc">{s.description}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
