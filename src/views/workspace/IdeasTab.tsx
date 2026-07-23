import { useMemo, useState } from 'react'

import type { Confidence, Idea, IdeaContentType, IdeaStatus, ProductionStage, Research } from '../../../shared/schema/project'
import { CONTENT_TYPE_OPTIONS, PRODUCTION_STAGE_OPTIONS, STATUS_OPTIONS } from '../../lib/ideaOptions'
import { GeneratedIdeaReview } from './GeneratedIdeaReview'
import { IdeaCard } from './IdeaCard'
import { IdeaEditor } from './IdeaEditor'

type Props = {
  ideas: Idea[]
  research: Research
  onChangeIdeas: (ideas: Idea[]) => void
  pendingGeneratedIdeas: Idea[]
  onChangePendingGeneratedIdeas: (ideas: Idea[]) => void
  onGenerate: (count: number) => void
  generating: boolean
  generateError: string | null
  selectedIdeaId: string | null
  onChangeSelectedIdeaId: (ideaId: string | null) => void
}

function createBlankIdea(): Idea {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    hook: '',
    format: '',
    targetViewer: '',
    problemSolved: '',
    visualConcept: '',
    pdfOrTemplateOpportunity: '',
    createdAt: now,
    summary: '',
    contentType: 'other',
    status: 'draft',
    sourceResearch: [],
    targetAudience: '',
    proposedOutcome: '',
    differentiator: '',
    confidence: 'low',
    notes: '',
    updatedAt: now,
    productionStage: 'idea',
  }
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }
type SortOption = 'newest' | 'oldest' | 'title' | 'confidence'

export function IdeasTab({
  ideas,
  research,
  onChangeIdeas,
  pendingGeneratedIdeas,
  onChangePendingGeneratedIdeas,
  onGenerate,
  generating,
  generateError,
  selectedIdeaId,
  onChangeSelectedIdeaId,
}: Props) {
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | IdeaStatus>('all')
  const [productionStageFilter, setProductionStageFilter] = useState<'all' | ProductionStage>('all')
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | IdeaContentType>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | Confidence>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [generateCount, setGenerateCount] = useState(5)

  const editingIdea = ideas.find((idea) => idea.id === editingIdeaId) ?? null

  const visibleIdeas = useMemo(() => {
    let list = ideas
    if (statusFilter !== 'all') list = list.filter((idea) => idea.status === statusFilter)
    if (productionStageFilter !== 'all') list = list.filter((idea) => idea.productionStage === productionStageFilter)
    if (contentTypeFilter !== 'all') list = list.filter((idea) => idea.contentType === contentTypeFilter)
    if (confidenceFilter !== 'all') list = list.filter((idea) => idea.confidence === confidenceFilter)

    const sorted = [...list]
    if (sortBy === 'newest') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (sortBy === 'oldest') sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
    if (sortBy === 'confidence') sorted.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
    return sorted
  }, [ideas, statusFilter, productionStageFilter, contentTypeFilter, confidenceFilter, sortBy])

  function handleCreateIdea() {
    const blank = createBlankIdea()
    onChangeIdeas([...ideas, blank])
    setEditingIdeaId(blank.id)
  }

  function handleUpdateIdea(updated: Idea) {
    onChangeIdeas(ideas.map((idea) => (idea.id === updated.id ? updated : idea)))
  }

  function handleDeleteIdea(id: string, title: string) {
    if (!window.confirm(`Delete "${title || 'this idea'}"? This cannot be undone.`)) return
    onChangeIdeas(ideas.filter((idea) => idea.id !== id))
    if (editingIdeaId === id) setEditingIdeaId(null)
    // Deleting the selected idea must clear the selection — but never
    // touches an existing designBrief, which keeps its own snapshot.
    if (selectedIdeaId === id) onChangeSelectedIdeaId(null)
  }

  function handleDuplicateIdea(idea: Idea) {
    const now = new Date().toISOString()
    const copy: Idea = {
      ...idea,
      id: crypto.randomUUID(),
      title: idea.title ? `${idea.title} (Copy)` : 'Untitled idea (Copy)',
      createdAt: now,
      updatedAt: now,
    }
    onChangeIdeas([...ideas, copy])
  }

  function handleAcceptDraft(draft: Idea) {
    onChangeIdeas([...ideas, draft])
    onChangePendingGeneratedIdeas(pendingGeneratedIdeas.filter((item) => item.id !== draft.id))
  }

  function handleAcceptAllDrafts() {
    onChangeIdeas([...ideas, ...pendingGeneratedIdeas])
    onChangePendingGeneratedIdeas([])
  }

  function handleDiscardDraft(id: string) {
    onChangePendingGeneratedIdeas(pendingGeneratedIdeas.filter((item) => item.id !== id))
  }

  function handleUpdateDraft(updated: Idea) {
    onChangePendingGeneratedIdeas(pendingGeneratedIdeas.map((item) => (item.id === updated.id ? updated : item)))
  }

  // Unreviewed AI drafts take priority over the normal list/edit view so they
  // can never be silently lost by switching tabs or starting another edit.
  if (pendingGeneratedIdeas.length > 0) {
    return (
      <GeneratedIdeaReview
        drafts={pendingGeneratedIdeas}
        research={research}
        onAccept={handleAcceptDraft}
        onAcceptAll={handleAcceptAllDrafts}
        onDiscard={handleDiscardDraft}
        onDiscardAll={() => onChangePendingGeneratedIdeas([])}
        onUpdateDraft={handleUpdateDraft}
      />
    )
  }

  if (editingIdea) {
    return (
      <IdeaEditor
        idea={editingIdea}
        research={research}
        onChange={handleUpdateIdea}
        onClose={() => setEditingIdeaId(null)}
        onDelete={() => handleDeleteIdea(editingIdea.id, editingIdea.title)}
      />
    )
  }

  return (
    <div className="ideas-tab">
      <p className="tab-explanation">
        Turn your research into concrete content and product ideas. Create ideas manually, or generate draft
        suggestions from your research with AI — nothing from AI generation is saved until you review and accept it.
      </p>

      <div className="ideas-toolbar">
        <button type="button" onClick={handleCreateIdea}>
          Create idea
        </button>
        <div className="ideas-generate-controls">
          <label>
            Generate
            <select value={generateCount} onChange={(event) => setGenerateCount(Number(event.target.value))}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            idea{generateCount === 1 ? '' : 's'} from research
          </label>
          <button type="button" onClick={() => onGenerate(generateCount)} disabled={generating}>
            {generating ? 'Generating...' : 'Generate ideas from research'}
          </button>
        </div>
      </div>
      {generateError && <p className="error-text">{generateError}</p>}

      <div className="ideas-filters">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | IdeaStatus)}>
            <option value="all">All</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Production stage
          <select
            value={productionStageFilter}
            onChange={(event) => setProductionStageFilter(event.target.value as 'all' | ProductionStage)}
          >
            <option value="all">All</option>
            {PRODUCTION_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Content format
          <select
            value={contentTypeFilter}
            onChange={(event) => setContentTypeFilter(event.target.value as 'all' | IdeaContentType)}
          >
            <option value="all">All</option>
            {CONTENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as 'all' | Confidence)}>
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>
      </div>

      {ideas.length === 0 && <p>No ideas yet — create one above or generate suggestions from your research.</p>}
      {ideas.length > 0 && visibleIdeas.length === 0 && <p>No ideas match the current filters.</p>}

      {visibleIdeas.length > 0 && (
        <ul className="idea-list">
          {visibleIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              isSelectedForProduction={idea.id === selectedIdeaId}
              onEdit={() => setEditingIdeaId(idea.id)}
              onDuplicate={() => handleDuplicateIdea(idea)}
              onDelete={() => handleDeleteIdea(idea.id, idea.title)}
              onSelectForProduction={() => onChangeSelectedIdeaId(idea.id)}
              onRemoveFromProduction={() => onChangeSelectedIdeaId(null)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
