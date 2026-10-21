import { toolIcon, toolShape } from '../lib/toolIcons'

interface Props {
  tool: string
  className?: string
}

// A single tool rendered as an emoji (or a CSS shape for tools with no decent
// emoji), with the raw tool name as its tooltip / accessible label. Used by
// StepCard and Timeline.
export function ToolIcon({ tool, className }: Props) {
  const label = tool.replace(/_/g, ' ')
  const shape = toolShape(tool)
  const cls = className ? `tool-icon ${className}` : 'tool-icon'

  if (shape === 'pan') {
    return <span className={`${cls} tool-rect`} title={label} role="img" aria-label={label} />
  }

  return (
    <span className={cls} title={label} role="img" aria-label={label}>
      {toolIcon(tool)}
    </span>
  )
}

interface ListProps {
  tools: string[]
  className?: string
}

// Horizontal row of tool icons; renders nothing when there are no tools.
export function ToolIcons({ tools, className }: ListProps) {
  if (tools.length === 0) return null
  return (
    <span className={className ? `tool-icons ${className}` : 'tool-icons'}>
      {tools.map((t) => (
        <ToolIcon key={t} tool={t} />
      ))}
    </span>
  )
}
