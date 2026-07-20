import type { SourceLink } from '../../../shared/schema/project'

type Props = {
  sources: SourceLink[]
  onChange: (sources: SourceLink[]) => void
}

export function SourceLinksEditor({ sources, onChange }: Props) {
  function addSource() {
    const newSource: SourceLink = {
      id: crypto.randomUUID(),
      url: '',
      label: '',
      addedAt: new Date().toISOString(),
      verified: false,
    }
    onChange([...sources, newSource])
  }

  function updateSource(id: string, patch: Partial<SourceLink>) {
    onChange(sources.map((source) => (source.id === id ? { ...source, ...patch } : source)))
  }

  function removeSource(id: string) {
    onChange(sources.filter((source) => source.id !== id))
  }

  return (
    <div className="source-links-editor">
      {sources.length === 0 && <p className="empty-hint">No source links yet.</p>}
      {sources.map((source) => (
        <div key={source.id} className="source-link-row">
          <input
            value={source.label}
            onChange={(event) => updateSource(source.id, { label: event.target.value })}
            placeholder="Label (e.g. Reddit thread on DWC pH)"
          />
          <input
            value={source.url}
            onChange={(event) => updateSource(source.id, { url: event.target.value })}
            placeholder="https://..."
          />
          <label className="source-link-verified">
            <input
              type="checkbox"
              checked={source.verified}
              onChange={(event) => updateSource(source.id, { verified: event.target.checked })}
            />
            Trusted source
          </label>
          <button type="button" className="danger-button" onClick={() => removeSource(source.id)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addSource}>
        Add source link
      </button>
    </div>
  )
}
