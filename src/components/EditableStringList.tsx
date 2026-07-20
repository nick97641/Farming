import { useState } from 'react'

type Props = {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  badge?: string
  placeholder?: string
}

export function EditableStringList({ label, items, onChange, badge, placeholder }: Props) {
  const [draft, setDraft] = useState('')

  function addItem() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...items, trimmed])
    setDraft('')
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
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
            <li key={`${index}-${item}`}>
              <span>{item}</span>
              <button type="button" onClick={() => removeItem(index)} aria-label={`Remove ${item}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="editable-list-input-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addItem()
            }
          }}
          placeholder={placeholder ?? 'Add an item...'}
        />
        <button type="button" onClick={addItem} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
