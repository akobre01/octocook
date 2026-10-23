import { useState } from 'react'
import type { CookStep } from '../types'
import { TOOL_VOCAB } from '../lib/toolIcons'
import { ToolIcon } from './ToolIcon'

interface Props {
  step: CookStep
  // Ids of the other steps, for the depends_on picker.
  otherStepIds: string[]
  onSave: (step: CookStep) => void
  onCancel: () => void
}

// Full-field editor for a single step: description, duration, active/passive,
// tools (from the controlled vocabulary), and depends_on.
export function StepEditor({ step, otherStepIds, onSave, onCancel }: Props) {
  const [description, setDescription] = useState(step.description)
  const [durationMin, setDurationMin] = useState(String(step.duration_min))
  const [active, setActive] = useState(step.active)
  const [tools, setTools] = useState<string[]>(step.tools)
  const [dependsOn, setDependsOn] = useState<string[]>(step.depends_on)
  // Edited as one ingredient per line, e.g. "3 eggs\n1 cup sugar".
  const [ingredientsText, setIngredientsText] = useState((step.ingredients ?? []).join('\n'))

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  const save = () => {
    const parsed = Math.max(0, Math.round(Number(durationMin) || 0))
    onSave({
      ...step,
      description: description.trim(),
      duration_min: parsed,
      active,
      tools,
      depends_on: dependsOn.filter((id) => otherStepIds.includes(id)),
      ingredients: ingredientsText.split('\n').map((s) => s.trim()).filter(Boolean),
    })
  }

  return (
    <div className="step-editor">
      <label className="field">
        <span className="field-label">Description</span>
        <textarea
          className="field-input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Ingredients (one per line)</span>
        <textarea
          className="field-input"
          rows={3}
          placeholder="3 eggs&#10;1 cup sugar"
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Duration (min)</span>
          <input
            className="field-input"
            type="number"
            min={0}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </label>
        <label className="field toggle-field">
          <input
            type="checkbox"
            checked={!active}
            onChange={(e) => setActive(!e.target.checked)}
          />
          <span>Hands-off (passive)</span>
        </label>
      </div>

      <div className="field">
        <span className="field-label">Tools</span>
        <div className="chip-grid">
          {TOOL_VOCAB.map((t) => {
            const on = tools.includes(t)
            return (
              <button
                key={t}
                type="button"
                className={on ? 'tool-chip on' : 'tool-chip'}
                onClick={() => setTools((ts) => toggle(ts, t))}
              >
                <ToolIcon tool={t} />
                <span>{t.replace(/_/g, ' ')}</span>
              </button>
            )
          })}
        </div>
      </div>

      {otherStepIds.length > 0 && (
        <div className="field">
          <span className="field-label">Depends on</span>
          <div className="chip-grid">
            {otherStepIds.map((id) => {
              const on = dependsOn.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  className={on ? 'dep-chip on' : 'dep-chip'}
                  onClick={() => setDependsOn((d) => toggle(d, id))}
                >
                  {id}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="editor-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={save}>Save step</button>
      </div>
    </div>
  )
}
