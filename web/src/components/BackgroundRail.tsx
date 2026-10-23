import type { ScheduleStep } from '../types'
import type { RecipeColor } from '../lib/recipeColors'
import { ToolIcon } from './ToolIcon'

interface Props {
  passive: ScheduleStep[]
  windowStart: number
  windowEnd: number
  excludeId?: string // the current step itself (shown in the main column, not the rail)
  colors: Record<string, RecipeColor>
  icons: Record<string, string>
}

// The dimmed vertical rail beside the current cook step: passive/background
// events (oven baking, dough rising) scheduled concurrently with the step
// you're on, each a recipe-colored block with its tool icon and duration.
export function BackgroundRail({ passive, windowStart, windowEnd, excludeId, colors, icons }: Props) {
  const running = passive.filter(
    (p) => p.step_id !== excludeId && p.start_min < windowEnd && p.end_min > windowStart,
  )
  if (running.length === 0) return null

  return (
    <aside className="bg-rail">
      <div className="bg-rail-label">Meanwhile</div>
      {running.map((p) => {
        const c = colors[p.recipe]
        const lead = p.tools[0]
        return (
          <div
            className="bg-event"
            key={p.step_id}
            style={{ borderColor: c?.accent }}
            title={`${p.recipe}: ${p.description}`}
          >
            <span className="bg-event-icon">{lead ? <ToolIcon tool={lead} /> : icons[p.recipe] ?? '⏳'}</span>
            <span className="bg-event-min">~{p.duration_min}m</span>
          </div>
        )
      })}
    </aside>
  )
}
