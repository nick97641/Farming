import type { Idea } from '../../../shared/schema/project'
import { CONTENT_TYPE_LABELS, PRODUCTION_STAGE_LABELS, STATUS_LABELS } from '../../lib/ideaOptions'

type Props = {
  idea: Idea
  isSelectedForProduction: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSelectForProduction: () => void
  onRemoveFromProduction: () => void
}

export function IdeaCard({
  idea,
  isSelectedForProduction,
  onEdit,
  onDuplicate,
  onDelete,
  onSelectForProduction,
  onRemoveFromProduction,
}: Props) {
  return (
    <li className="idea-card">
      <div className="idea-card-main">
        <div className="idea-card-header">
          <span className="idea-card-title">{idea.title || '(untitled idea)'}</span>
          <span className={`confidence-badge confidence-${idea.confidence}`}>
            support confidence: {idea.confidence}
          </span>
          {isSelectedForProduction && <span className="idea-selected-badge">Selected for production</span>}
        </div>
        <div className="idea-card-meta">
          <span className="idea-card-tag">{CONTENT_TYPE_LABELS[idea.contentType]}</span>
          <span className={`idea-status-badge idea-status-${idea.status}`}>{STATUS_LABELS[idea.status]}</span>
          <span className="idea-status-badge">{PRODUCTION_STAGE_LABELS[idea.productionStage]}</span>
          <span className="idea-card-sources">
            {idea.sourceResearch.length} supporting research item{idea.sourceResearch.length === 1 ? '' : 's'}
          </span>
        </div>
        {idea.summary && <p className="idea-card-summary">{idea.summary}</p>}
      </div>
      <div className="idea-card-actions">
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        {isSelectedForProduction ? (
          <button type="button" onClick={onRemoveFromProduction}>
            Remove from production
          </button>
        ) : (
          idea.status === 'approved' && (
            <button type="button" onClick={onSelectForProduction}>
              Select for production
            </button>
          )
        )}
        <button type="button" className="danger-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  )
}
