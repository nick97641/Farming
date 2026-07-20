import { useState } from 'react'

import type { DesignBrief, Idea } from '../../../shared/schema/project'
import { EditableStringList } from '../../components/EditableStringList'
import { CONTENT_TYPE_LABELS } from '../../lib/ideaOptions'

type Props = {
  ideas: Idea[]
  selectedIdeaId: string | null
  designBrief: DesignBrief | null
  onChangeDesignBrief: (designBrief: DesignBrief | null) => void
}

function createBriefFromIdea(idea: Idea): DesignBrief {
  const now = new Date().toISOString()
  return {
    sourceIdeaId: idea.id,
    status: 'draft',
    title: idea.title,
    audience: idea.targetAudience,
    problem: idea.problemSolved,
    outcome: idea.proposedOutcome,
    format: CONTENT_TYPE_LABELS[idea.contentType],
    contentRequirements: [],
    visualDirection: '',
    constraints: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function DesignBriefTab({ ideas, selectedIdeaId, designBrief, onChangeDesignBrief }: Props) {
  // A stale in-session selection (e.g. the selected idea's status changed
  // away from "approved" without a reload) is treated as no selection here,
  // the same "resolved at display time" approach used for research
  // references — rather than trusting a value that may no longer hold.
  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId && idea.status === 'approved') ?? null
  const sourceIdea = designBrief ? (ideas.find((idea) => idea.id === designBrief.sourceIdeaId) ?? null) : null
  const mismatch = designBrief !== null && designBrief.sourceIdeaId !== selectedIdeaId
  const mismatchKey = designBrief ? `${designBrief.sourceIdeaId}:${String(selectedIdeaId)}` : null

  const [dismissedMismatchKey, setDismissedMismatchKey] = useState<string | null>(null)
  const showMismatchWarning = mismatch && mismatchKey !== dismissedMismatchKey

  function patch(fields: Partial<DesignBrief>) {
    if (!designBrief) return
    onChangeDesignBrief({ ...designBrief, ...fields, updatedAt: new Date().toISOString() })
  }

  function handleReplace() {
    if (!selectedIdea) return
    if (
      !window.confirm(
        'Replace the current Design Brief with a new blank brief from the selected idea? This discards the existing brief content and cannot be undone.',
      )
    ) {
      return
    }
    onChangeDesignBrief(createBriefFromIdea(selectedIdea))
  }

  if (!designBrief) {
    return (
      <div className="design-brief-tab">
        <p className="tab-explanation">
          Turn the idea you&apos;ve selected for production into a concrete brief — audience, problem, format, and
          requirements — before moving on to images, PDFs, and templates.
        </p>
        {!selectedIdea && (
          <p className="empty-hint">
            No idea is selected for production yet. Go to the Ideas tab, approve an idea, and select it for
            production to start a brief here.
          </p>
        )}
        {selectedIdea && (
          <button type="button" onClick={() => onChangeDesignBrief(createBriefFromIdea(selectedIdea))}>
            Create Design Brief from &quot;{selectedIdea.title || 'selected idea'}&quot;
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="design-brief-tab">
      <p className="tab-explanation">
        This brief is an editable snapshot of the idea it was created from — it will not change automatically if the
        selected idea changes or is edited.
      </p>

      {showMismatchWarning && (
        <div className="design-brief-mismatch-warning">
          <p>
            This Design Brief was created from{' '}
            {sourceIdea ? `"${sourceIdea.title || 'an untitled idea'}"` : 'an idea that no longer exists'}, which is
            different from the idea currently selected for production
            {selectedIdea ? ` ("${selectedIdea.title || 'untitled idea'}")` : ' (none selected)'}.
          </p>
          <div className="design-brief-mismatch-actions">
            <button type="button" onClick={() => setDismissedMismatchKey(mismatchKey)}>
              Keep current brief
            </button>
            <button type="button" className="danger-button" onClick={handleReplace} disabled={!selectedIdea}>
              Replace with new blank brief
            </button>
          </div>
        </div>
      )}

      {!mismatch && !sourceIdea && (
        <p className="empty-hint">The idea this brief was created from no longer exists.</p>
      )}

      <section className="idea-editor-group">
        <label className="field">
          Status
          <select
            value={designBrief.status}
            onChange={(event) => patch({ status: event.target.value as DesignBrief['status'] })}
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
          </select>
        </label>
        <label className="field">
          Title
          <input value={designBrief.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label className="field">
          Audience
          <textarea rows={2} value={designBrief.audience} onChange={(event) => patch({ audience: event.target.value })} />
        </label>
        <label className="field">
          Problem
          <textarea rows={3} value={designBrief.problem} onChange={(event) => patch({ problem: event.target.value })} />
        </label>
        <label className="field">
          Outcome
          <textarea rows={3} value={designBrief.outcome} onChange={(event) => patch({ outcome: event.target.value })} />
        </label>
        <label className="field">
          Format
          <input value={designBrief.format} onChange={(event) => patch({ format: event.target.value })} />
        </label>
        <label className="field">
          Visual direction
          <textarea
            rows={3}
            value={designBrief.visualDirection}
            onChange={(event) => patch({ visualDirection: event.target.value })}
          />
        </label>
        <EditableStringList
          label="Content requirements"
          items={designBrief.contentRequirements}
          onChange={(contentRequirements) => patch({ contentRequirements })}
          placeholder="Add a requirement..."
        />
        <EditableStringList
          label="Constraints"
          items={designBrief.constraints}
          onChange={(constraints) => patch({ constraints })}
          placeholder="Add a constraint..."
        />
      </section>
    </div>
  )
}
