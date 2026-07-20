import type { Confidence, Idea, Research } from '../../../shared/schema/project'
import { CONTENT_TYPE_OPTIONS, STATUS_OPTIONS } from '../../lib/ideaOptions'
import { isReferenceAvailable } from '../../lib/researchReferences'
import { ResearchPicker } from './ResearchPicker'

type Props = {
  idea: Idea
  research: Research
  onChange: (idea: Idea) => void
  onClose: () => void
  onDelete: () => void
}

const CONFIDENCE_OPTIONS: Confidence[] = ['high', 'medium', 'low']

export function IdeaEditor({ idea, research, onChange, onClose, onDelete }: Props) {
  function patch(fields: Partial<Idea>) {
    onChange({ ...idea, ...fields, updatedAt: new Date().toISOString() })
  }

  function handlePrefill() {
    const fields: Partial<Idea> = {}
    const firstReference = idea.sourceResearch[0]
    if (!idea.summary.trim() && firstReference) {
      fields.summary = `Idea based on: ${firstReference.text}`
    }
    const problemReference = idea.sourceResearch.find((ref) => ref.kind === 'audienceProblem' || ref.kind === 'contentGap')
    if (!idea.problemSolved.trim() && problemReference) {
      fields.problemSolved = problemReference.text
    }
    const opportunityReference = idea.sourceResearch.find((ref) => ref.kind === 'estimatedOpportunity')
    if (!idea.proposedOutcome.trim() && opportunityReference) {
      fields.proposedOutcome = opportunityReference.text
    }
    if (Object.keys(fields).length > 0) patch(fields)
  }

  function removeReference(referenceId: string) {
    patch({ sourceResearch: idea.sourceResearch.filter((ref) => ref.id !== referenceId) })
  }

  return (
    <div className="idea-editor">
      <div className="idea-editor-toolbar">
        <button type="button" onClick={onClose}>
          &larr; Back to ideas
        </button>
        <button type="button" className="danger-button" onClick={onDelete}>
          Delete idea
        </button>
      </div>

      <section className="idea-editor-group">
        <h3>Core idea</h3>
        <label className="field">
          Title
          <input value={idea.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label className="field">
          Summary
          <textarea rows={4} value={idea.summary} onChange={(event) => patch({ summary: event.target.value })} />
        </label>
        <label className="field">
          Content format
          <select
            value={idea.contentType}
            onChange={(event) => patch({ contentType: event.target.value as Idea['contentType'] })}
          >
            {CONTENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="idea-editor-group">
        <h3>Audience and value</h3>
        <label className="field">
          Target audience
          <input value={idea.targetAudience} onChange={(event) => patch({ targetAudience: event.target.value })} />
        </label>
        <label className="field">
          Problem solved
          <textarea
            rows={3}
            value={idea.problemSolved}
            onChange={(event) => patch({ problemSolved: event.target.value })}
          />
        </label>
        <label className="field">
          Proposed outcome
          <textarea
            rows={3}
            value={idea.proposedOutcome}
            onChange={(event) => patch({ proposedOutcome: event.target.value })}
          />
        </label>
        <label className="field">
          Differentiator
          <textarea
            rows={3}
            value={idea.differentiator}
            onChange={(event) => patch({ differentiator: event.target.value })}
          />
        </label>
      </section>

      <section className="idea-editor-group">
        <h3>Evidence</h3>

        {idea.sourceResearch.length > 0 && (
          <ul className="idea-source-list">
            {idea.sourceResearch.map((reference) => {
              const available = isReferenceAvailable(reference, research)
              return (
                <li key={reference.id} className={available ? '' : 'idea-source-unavailable'}>
                  <span>{reference.text}</span>
                  {!available && <span className="ai-badge">unavailable</span>}
                  {reference.kind === 'aiCitation' && <span className="ai-badge">AI cited</span>}
                  <button type="button" onClick={() => removeReference(reference.id)} aria-label="Remove reference">
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <details className="research-picker-details">
          <summary>Attach supporting research</summary>
          <ResearchPicker
            research={research}
            selected={idea.sourceResearch}
            onChange={(sourceResearch) => patch({ sourceResearch })}
          />
        </details>

        <button type="button" onClick={handlePrefill}>
          Prefill empty fields from selected research
        </button>

        <label className="field">
          Support confidence
          <select
            value={idea.confidence}
            onChange={(event) => patch({ confidence: event.target.value as Idea['confidence'] })}
          >
            {CONFIDENCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="idea-editor-group">
        <h3>Management</h3>
        <label className="field">
          Status
          <select value={idea.status} onChange={(event) => patch({ status: event.target.value as Idea['status'] })}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Notes
          <textarea rows={4} value={idea.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </label>
      </section>
    </div>
  )
}
