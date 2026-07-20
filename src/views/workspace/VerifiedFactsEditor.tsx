import { useState } from 'react'

import type { SourceLink, VerifiedFact } from '../../../shared/schema/project'

type Props = {
  facts: VerifiedFact[]
  sources: SourceLink[]
  onChange: (facts: VerifiedFact[]) => void
}

export function VerifiedFactsEditor({ facts, sources, onChange }: Props) {
  const [draftText, setDraftText] = useState('')
  const [draftSourceId, setDraftSourceId] = useState('')

  function addFact() {
    const trimmed = draftText.trim()
    if (!trimmed) return
    const fact: VerifiedFact = {
      id: crypto.randomUUID(),
      text: trimmed,
      sourceId: draftSourceId || null,
      addedAt: new Date().toISOString(),
    }
    onChange([...facts, fact])
    setDraftText('')
    setDraftSourceId('')
  }

  function removeFact(id: string) {
    onChange(facts.filter((fact) => fact.id !== id))
  }

  function sourceLabel(sourceId: string | null): string | null {
    if (!sourceId) return null
    const source = sources.find((candidate) => candidate.id === sourceId)
    return source ? source.label || source.url : null
  }

  return (
    <div className="verified-facts-editor">
      <p className="field-hint">
        Only add a fact here once you have personally confirmed it. This list is never written by the AI.
      </p>
      {facts.length === 0 && <p className="empty-hint">No verified facts yet.</p>}
      {facts.length > 0 && (
        <ul className="verified-facts-list">
          {facts.map((fact) => (
            <li key={fact.id}>
              <span>{fact.text}</span>
              {sourceLabel(fact.sourceId) && <span className="fact-source">— {sourceLabel(fact.sourceId)}</span>}
              <button type="button" onClick={() => removeFact(fact.id)} aria-label="Remove fact">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="verified-fact-input-row">
        <input
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          placeholder="A fact you've personally confirmed..."
        />
        <select value={draftSourceId} onChange={(event) => setDraftSourceId(event.target.value)}>
          <option value="">No source</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label || source.url || 'Untitled source'}
            </option>
          ))}
        </select>
        <button type="button" onClick={addFact} disabled={!draftText.trim()}>
          Add fact
        </button>
      </div>
    </div>
  )
}
