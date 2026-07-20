import { useState } from 'react'

import type { Confidence, ConfidentText } from '../../shared/schema/project'

type Props = {
  label: string
  items: ConfidentText[]
  onChange: (items: ConfidentText[]) => void
  badge?: string
  placeholder?: string
}

const CONFIDENCE_OPTIONS: Confidence[] = ['high', 'medium', 'low']

export function ConfidentTextList({ label, items, onChange, badge, placeholder }: Props) {
  const [draftText, setDraftText] = useState('')
  const [draftConfidence, setDraftConfidence] = useState<Confidence>('medium')

  function addItem() {
    const trimmed = draftText.trim()
    if (!trimmed) return
    onChange([...items, { text: trimmed, confidence: draftConfidence }])
    setDraftText('')
    setDraftConfidence('medium')
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function updateConfidence(index: number, confidence: Confidence) {
    onChange(items.map((item, i) => (i === index ? { ...item, confidence } : item)))
  }

  return (
    <div className="editable-list">
      <div className="editable-list-header">
        <span className="editable-list-label">{label}</span>
        {badge && <span className="ai-badge">{badge}</span>}
      </div>
      {items.length > 0 && (
        <ul className="editable-list-items">
          {items.map((item, index) => (
            <li key={`${index}-${item.text}`}>
              <span>{item.text}</span>
              <span className="confidence-controls">
                <span
                  className={`confidence-badge confidence-${item.confidence}`}
                  title="Support confidence: how strongly your own notes and research support this item — not verified accuracy"
                >
                  support confidence: {item.confidence}
                </span>
                <select
                  aria-label="Change support confidence"
                  value={item.confidence}
                  onChange={(event) => updateConfidence(index, event.target.value as Confidence)}
                >
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </span>
              <button type="button" onClick={() => removeItem(index)} aria-label={`Remove ${item.text}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="editable-list-input-row">
        <input
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addItem()
            }
          }}
          placeholder={placeholder ?? 'Add an item...'}
        />
        <select value={draftConfidence} onChange={(event) => setDraftConfidence(event.target.value as Confidence)}>
          {CONFIDENCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button type="button" onClick={addItem} disabled={!draftText.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
