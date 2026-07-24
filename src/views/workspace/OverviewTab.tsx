import { useEffect, useState } from 'react'

import type { DesignBrief, Idea, ImageJob } from '../../../shared/schema/project'
import { getModelProfile } from '../../../shared/modelProfiles'
import { getImageJobFileUrl } from '../../lib/api'
import { PRODUCTION_STAGE_LABELS, STATUS_LABELS } from '../../lib/ideaOptions'
import { getDesignBriefReadiness, getTextReadiness, hasPublicationInfo, isSafeWebUrl } from '../../lib/productionSummary'

type SummaryTabId = 'ideas' | 'brief' | 'images' | 'content'

type Props = {
  title: string
  topic: string
  onChangeTitle: (title: string) => void
  onChangeTopic: (topic: string) => void
  projectId: string
  ideas: Idea[]
  selectedIdeaId: string | null
  designBrief: DesignBrief | null
  youtubeScript: string
  pdfDraft: string
  imageJobs: ImageJob[]
  selectedImageJobId: string | null
  onNavigate: (tab: SummaryTabId) => void
}

export function OverviewTab({
  title,
  topic,
  onChangeTitle,
  onChangeTopic,
  projectId,
  ideas,
  selectedIdeaId,
  designBrief,
  youtubeScript,
  pdfDraft,
  imageJobs,
  selectedImageJobId,
  onNavigate,
}: Props) {
  const [imageMissing, setImageMissing] = useState(false)

  // This summary only ever reads whichever idea/image the rest of the app
  // already selected — it never picks one itself, and it displays whatever
  // status the reference currently has rather than re-validating it (that
  // defensive re-check belongs to the tab, like Design Brief, that actually
  // depends on the idea still being approved).
  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId) ?? null
  const selectedImageJob = imageJobs.find((job) => job.id === selectedImageJobId) ?? null

  // A stale "file missing" flag from a previously-selected image must never
  // carry over to a newly-selected one that loads fine.
  useEffect(() => {
    setImageMissing(false)
  }, [selectedImageJob?.id])

  const designBriefReadiness = getDesignBriefReadiness(designBrief)
  const scriptReadiness = getTextReadiness(youtubeScript)
  const pdfReadiness = getTextReadiness(pdfDraft)

  return (
    <div className="overview-tab">
      <label className="field">
        Title
        <input value={title} onChange={(event) => onChangeTitle(event.target.value)} />
      </label>

      <label className="field">
        Topic
        <input value={topic} onChange={(event) => onChangeTopic(event.target.value)} />
      </label>

      <section className="idea-editor-group">
        <h3>Production summary</h3>

        <div className="idea-card">
          <div className="idea-card-main">
            <div className="idea-card-header">
              <span className="idea-card-title">Selected idea</span>
              {selectedIdea && (
                <span className={`idea-status-badge idea-status-${selectedIdea.status}`}>
                  {STATUS_LABELS[selectedIdea.status]}
                </span>
              )}
              {selectedIdea && (
                <span className="idea-status-badge">{PRODUCTION_STAGE_LABELS[selectedIdea.productionStage]}</span>
              )}
            </div>
            {selectedIdea ? (
              <p className="idea-card-summary">{selectedIdea.title || '(untitled idea)'}</p>
            ) : (
              <p className="empty-hint">No idea selected for production yet.</p>
            )}
            {selectedIdea && hasPublicationInfo(selectedIdea.publication) && (
              <>
                {selectedIdea.publication.platform.trim() && (
                  <p className="field-hint">Platform/channel: {selectedIdea.publication.platform}</p>
                )}
                {selectedIdea.publication.publishedAt.trim() && (
                  <p className="field-hint">Published: {selectedIdea.publication.publishedAt}</p>
                )}
                {selectedIdea.publication.url.trim() && (
                  <p className="field-hint">
                    URL:{' '}
                    {isSafeWebUrl(selectedIdea.publication.url) ? (
                      <a href={selectedIdea.publication.url} target="_blank" rel="noreferrer noopener">
                        {selectedIdea.publication.url}
                      </a>
                    ) : (
                      selectedIdea.publication.url
                    )}
                  </p>
                )}
                {selectedIdea.publication.notes.trim() && (
                  <p className="field-hint">Notes: {selectedIdea.publication.notes}</p>
                )}
              </>
            )}
            {selectedIdea &&
              !hasPublicationInfo(selectedIdea.publication) &&
              selectedIdea.productionStage === 'published' && (
                <p className="empty-hint">Published — no publication details recorded.</p>
              )}
          </div>
          <div className="idea-card-actions">
            <button type="button" onClick={() => onNavigate('ideas')}>
              Go to Ideas
            </button>
          </div>
        </div>

        <div className="idea-card">
          <div className="idea-card-main">
            <div className="idea-card-header">
              <span className="idea-card-title">Design Brief</span>
              <span className={designBriefReadiness === 'Ready' ? 'idea-selected-badge' : 'idea-status-badge'}>
                {designBriefReadiness}
              </span>
            </div>
          </div>
          <div className="idea-card-actions">
            <button type="button" onClick={() => onNavigate('brief')}>
              Go to Design Brief
            </button>
          </div>
        </div>

        <div className="idea-card">
          <div className="idea-card-main">
            <div className="idea-card-header">
              <span className="idea-card-title">Content</span>
            </div>
            <div className="idea-card-meta">
              <span className={scriptReadiness === 'Ready' ? 'idea-selected-badge' : 'idea-status-badge'}>
                YouTube script: {scriptReadiness}
              </span>
              <span className={pdfReadiness === 'Ready' ? 'idea-selected-badge' : 'idea-status-badge'}>
                PDF draft: {pdfReadiness}
              </span>
            </div>
          </div>
          <div className="idea-card-actions">
            <button type="button" onClick={() => onNavigate('content')}>
              Go to Content
            </button>
          </div>
        </div>

        <div className="idea-card">
          <div className="idea-card-main">
            <div className="idea-card-header">
              <span className="idea-card-title">Preferred image</span>
            </div>
            {selectedImageJob ? (
              <>
                {!imageMissing && (
                  <img
                    className="image-job-thumb"
                    src={getImageJobFileUrl(projectId, selectedImageJob.id)}
                    alt={selectedImageJob.label || 'Preferred image'}
                    onError={() => setImageMissing(true)}
                  />
                )}
                {imageMissing && <p className="error-text">File missing from disk</p>}
                <p className="field-hint">
                  {selectedImageJob.label || '(untitled image job)'} · {selectedImageJob.width}×
                  {selectedImageJob.height}
                </p>
                <p className="field-hint">
                  Requested model: {getModelProfile(selectedImageJob.modelProfileId).label}.{' '}
                  {selectedImageJob.effectiveModel
                    ? `Draw Things reported using: ${selectedImageJob.effectiveModel}.`
                    : 'Draw Things did not report which model it used.'}
                </p>
              </>
            ) : (
              <p className="empty-hint">No preferred image selected yet.</p>
            )}
          </div>
          <div className="idea-card-actions">
            <button type="button" onClick={() => onNavigate('images')}>
              Go to Image Generation
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
