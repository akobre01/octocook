import { useState } from 'react'
import type { Recipe, RecipeVariant } from '../types'
import {
  cloneSteps,
  createVariant,
  deleteVariant,
  updateVariant,
} from '../lib/variantStore'

interface Props {
  base: Recipe
  variants: RecipeVariant[]
  activeVariantId: string | null
  onSelect: (id: string | null) => void
  onChange: () => void // re-read variants after create/rename/reset/delete
}

// Per-recipe variant selector: Original | <variants> | + New, plus manage
// actions (rename / reset to Original / delete) for the active variant.
// The bundled Original (id null) is never mutated.
export function VariantBar({ base, variants, activeVariantId, onSelect, onChange }: Props) {
  const [prompt, setPrompt] = useState<{ mode: 'new' | 'rename'; value: string } | null>(null)
  const active = variants.find((v) => v.id === activeVariantId) ?? null

  const confirmPrompt = () => {
    if (!prompt) return
    const name = prompt.value.trim()
    if (!name) return
    if (prompt.mode === 'new') {
      const v = createVariant(base, name)
      onChange()
      onSelect(v.id)
    } else if (active) {
      updateVariant({ ...active, name })
      onChange()
    }
    setPrompt(null)
  }

  const resetToOriginal = () => {
    if (!active) return
    updateVariant({ ...active, cookSteps: cloneSteps(base.cookSteps) })
    onChange()
  }

  const removeVariant = () => {
    if (!active) return
    deleteVariant(active.id)
    onChange()
    onSelect(null)
  }

  return (
    <div className="variant-bar">
      <div className="variant-chips">
        <button
          className={activeVariantId === null ? 'variant-chip on' : 'variant-chip'}
          onClick={() => onSelect(null)}
        >
          Original
        </button>
        {variants.map((v) => (
          <button
            key={v.id}
            className={v.id === activeVariantId ? 'variant-chip on' : 'variant-chip'}
            onClick={() => onSelect(v.id)}
          >
            {v.name}
          </button>
        ))}
        <button
          className="variant-chip add"
          onClick={() => setPrompt({ mode: 'new', value: '' })}
        >
          + New
        </button>
      </div>

      {prompt && (
        <div className="variant-prompt">
          <input
            className="field-input"
            autoFocus
            placeholder={prompt.mode === 'new' ? 'Variant name (e.g. Alice)' : 'New name'}
            value={prompt.value}
            onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmPrompt() }}
          />
          <button className="primary" onClick={confirmPrompt}>
            {prompt.mode === 'new' ? 'Create' : 'Rename'}
          </button>
          <button onClick={() => setPrompt(null)}>Cancel</button>
        </div>
      )}

      {active && !prompt && (
        <div className="variant-manage">
          <button className="link" onClick={() => setPrompt({ mode: 'rename', value: active.name })}>Rename</button>
          <button className="link" onClick={resetToOriginal}>Reset to Original</button>
          <button className="link danger" onClick={removeVariant}>Delete</button>
        </div>
      )}
    </div>
  )
}
