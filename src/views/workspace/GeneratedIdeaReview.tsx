import { useState } from 'react'

import type { Idea, Research } from '../../../shared/schema/project'
import { CONTENT_TYPE_LABELS } from '../../lib/ideaOptions'
import { IdeaEditor } from './IdeaEditor'

type Props = {
  drafts: Idea[]
  research: Research
  onAccept: (idea: Idea) => void
  onAcceptAll: () => void
  onDiscard: (ideaId: string) => void
  onDiscardAll: () => void
  onUpdateDraft: (idea: Idea) => void
}

export function GeneratedIdeaReview({ drafts, research, onAccept, onAcceptAll, onDiscard, onDiscardAll, onUpdateDraft }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingDraft = drafts.find((draft) => draft.id === editingId) ?? null

  if (editingDraft) {
    return (
      <div className="generated-review">
        <p className="ai-badge">AI-generated draft — unverified, review before use</p>
        <IdeaEditor
          idea={editingDraft}
          research={research}
          onChange={onUpdateDraft}
          onClose={() => setEditingId(null)}
          onDelete={() => {
            onDiscard(editingDraft.id)
            setEditingId(null)
          }}
        />
        <button
          type="button"
          onClick={() => {
            onAccept(editingDraft)
            setEditingId(null)
          }}
        >
          Accept this idea
        </button>
      </div>
    )
  }

  return (
    <div className="generated-review">
      <div className="generated-review-toolbar">
        <p>
          {drafts.length} draft idea{drafts.length === 1 ? '' : 's'} to review — nothing is saved until you accept it.
        </p>
        <div>
          <button type="button" onClick={onAcceptAll}>
            Accept all
          </button>
          <button type="button" className="danger-button" onClick={onDiscardAll}>
            Discard all
          </button>
        </div>
      </div>
      <ul className="idea-list">
        {drafts.map((draft) => (
          <li key={draft.id} className="idea-card">
            <div className="idea-card-main">
              <div className="idea-card-header">
                <span className="idea-card-title">{draft.title || '(untitled idea)'}</span>
                <span className={`confidence-badge confidence-${draft.confidence}`}>
                  support confidence: {draft.confidence}
                </span>
              </div>
              <div className="idea-card-meta">
                <span className="idea-card-tag">{CONTENT_TYPE_LABELS[draft.contentType]}</span>
                <span className="ai-badge">AI-generated — unverified</span>
              </div>
              {draft.summary && <p className="idea-card-summary">{draft.summary}</p>}
              {draft.notes && <p className="idea-card-summary">Notes: {draft.notes}</p>}
            </div>
            <div className="idea-card-actions">
              <button type="button" onClick={() => onAccept(draft)}>
                Accept
              </button>
              <button type="button" onClick={() => setEditingId(draft.id)}>
                Edit
              </button>
              <button type="button" className="danger-button" onClick={() => onDiscard(draft.id)}>
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
