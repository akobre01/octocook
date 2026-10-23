import { useState } from 'react'
import type { CookStep } from '../types'
import { ToolIcons } from './ToolIcon'
import { StepEditor } from './StepEditor'

interface Props {
  recipeName: string
  recipeIcon?: string
  variantLabel: string // e.g. "Original" or a variant name
  steps: CookStep[]
  onDone: (steps: CookStep[]) => void
  onCancel: () => void
}

// Generate a fresh, unique step id (S0, S1, …) not already used.
function nextStepId(steps: CookStep[]): string {
  let max = -1
  for (const s of steps) {
    const m = /^S(\d+)$/.exec(s.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `S${max + 1}`
}

// Edit the list of steps for a recipe/variant: edit a step's fields, add, delete,
// and reorder. Works on a local copy; onDone hands back the edited steps.
export function RecipeEditor({ recipeName, recipeIcon, variantLabel, steps, onDone, onCancel }: Props) {
  const [working, setWorking] = useState<CookStep[]>(steps)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = editingId ? working.find((s) => s.id === editingId) ?? null : null

  const saveStep = (updated: CookStep) => {
    setWorking((ws) => ws.map((s) => (s.id === updated.id ? updated : s)))
    setEditingId(null)
  }

  const deleteStep = (id: string) => {
    setWorking((ws) =>
      ws
        .filter((s) => s.id !== id)
        .map((s) => ({ ...s, depends_on: s.depends_on.filter((d) => d !== id) })),
    )
  }

  const move = (index: number, dir: -1 | 1) => {
    setWorking((ws) => {
      const next = [...ws]
      const j = index + dir
      if (j < 0 || j >= next.length) return ws
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const addStep = () => {
    const id = nextStepId(working)
    const blank: CookStep = {
      id,
      description: '',
      duration_min: 5,
      active: true,
      tools: [],
      depends_on: [],
    }
    setWorking((ws) => [...ws, blank])
    setEditingId(id)
  }

  if (editing) {
    return (
      <div className="recipe-editor">
        <header className="editor-header">
          <button className="link" onClick={() => setEditingId(null)}>← Steps</button>
          <h2>Edit step {editing.id}</h2>
        </header>
        <StepEditor
          step={editing}
          otherStepIds={working.filter((s) => s.id !== editing.id).map((s) => s.id)}
          onSave={saveStep}
          onCancel={() => setEditingId(null)}
        />
      </div>
    )
  }

  return (
    <div className="recipe-editor">
      <header className="editor-header">
        <button className="link" onClick={onCancel}>← Cancel</button>
        <h2>{recipeIcon} {recipeName}</h2>
        <button className="primary" onClick={() => onDone(working)}>Done</button>
      </header>
      <div className="editor-subhead muted">Editing: {variantLabel}</div>

      <ol className="editor-steps">
        {working.map((s, i) => (
          <li key={s.id} className="editor-step">
            <span className="es-num">{i + 1}</span>
            <button className="es-main" onClick={() => setEditingId(s.id)}>
              <span className="es-desc">{s.description || <em className="muted">(empty)</em>}</span>
              <span className="es-meta">
                ~{s.duration_min}m
                {!s.active && <span className="passive-tag">hands-off</span>}
                <ToolIcons tools={s.tools} />
              </span>
            </button>
            <div className="es-controls">
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === working.length - 1} aria-label="Move down">↓</button>
              <button className="danger" onClick={() => deleteStep(s.id)} aria-label="Delete">🗑</button>
            </div>
          </li>
        ))}
      </ol>

      <button className="add-step" onClick={addStep}>+ Add step</button>
    </div>
  )
}
