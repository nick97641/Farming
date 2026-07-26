import { useState } from 'react'

import type { Idea, YoutubeOpportunityEvidence } from '../../../shared/schema/project'
import type { OpportunityScoutConfig, ResearchJob } from '../../lib/api'

function SupportingVideosDetails({ evidence }: { evidence: YoutubeOpportunityEvidence }) {
  return (
    <details className="research-picker-details">
      <summary>
        Supporting videos ({evidence.supportingVideos.length}) — search phrase &quot;{evidence.searchPhrase}&quot;,
        retrieved {new Date(evidence.retrievedAt).toLocaleString()}
      </summary>
      <p className="field-hint">
        {evidence.totalResultsFound.toLocaleString()} total results found on YouTube · median{' '}
        {evidence.medianViewsPerDay.toFixed(1)} views/day among retrieved videos · {evidence.outlierVideoIds.length}{' '}
        outlier{evidence.outlierVideoIds.length === 1 ? '' : 's'} (views/day over 2x the median)
      </p>
      <ul className="idea-source-list">
        {evidence.supportingVideos.map((video) => {
          const isOutlier = evidence.outlierVideoIds.includes(video.videoId)
          return (
            <li key={video.videoId} className={isOutlier ? 'idea-source-unavailable' : ''}>
              <span>
                <a href={video.url} target="_blank" rel="noreferrer">
                  {video.title}
                </a>{' '}
                — {video.channelTitle} — {video.viewCount.toLocaleString()} views ({video.viewsPerDay.toFixed(1)}
                /day)
                {video.engagementRate !== null ? `, ${(video.engagementRate * 100).toFixed(2)}% engagement` : ''}
              </span>
              {isOutlier && <span className="ai-badge">outlier</span>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

type Props = {
  projectTopic: string
  onFindOpportunities: (config: OpportunityScoutConfig, mode?: 'topic' | 'discover') => void
  finding: boolean
  findError: string | null
  researchJob: ResearchJob | null
  pendingOpportunities: Idea[]
  phrasesWithNoResults: string[]
  phraseErrors: { phrase: string; error: string }[]
  onAccept: (idea: Idea) => void
  onAcceptAll: () => void
  onDiscard: (ideaId: string) => void
  onDiscardAll: () => void
}

const DEFAULT_CONFIG: OpportunityScoutConfig = {
  seedTopic: '',
  regionCode: 'US',
  languageCode: 'en',
  publishedAfterDays: 30,
  maxSearchPhrases: 3,
  maxResultsPerPhrase: 10,
}

export function OpportunityScoutSection({
  projectTopic,
  onFindOpportunities,
  finding,
  findError,
  researchJob,
  pendingOpportunities,
  phrasesWithNoResults,
  phraseErrors,
  onAccept,
  onAcceptAll,
  onDiscard,
  onDiscardAll,
}: Props) {
  const [config, setConfig] = useState<OpportunityScoutConfig>({ ...DEFAULT_CONFIG, seedTopic: projectTopic })

  function patchConfig(patch: Partial<OpportunityScoutConfig>) {
    setConfig((current) => ({ ...current, ...patch }))
  }

  const canSubmit = config.seedTopic.trim().length > 0 && !finding

  const providerLabels: Record<keyof ResearchJob['providers'], string> = {
    web: 'Web search', wikipedia: 'Reference search', youtube: 'YouTube sample', pageReview: 'Page review', ai: 'Local AI',
  }

  if (pendingOpportunities.length > 0) {
    return (
      <section className="research-section opportunity-scout">
        <h2>YouTube Opportunity Scout</h2>
        <p className="tab-explanation">
          {pendingOpportunities.length} opportunity draft{pendingOpportunities.length === 1 ? '' : 's'} to review —
          nothing is added to your Ideas list until you accept it. Each draft is AI-synthesized from real, public
          YouTube data: the supporting videos, their exact metrics, and the retrieval date are never altered by AI —
          only the rationale, titles, hooks, outline, and description are AI-written and unverified. A video
          performing well is a correlation, not a guarantee of future views.
        </p>
        {(phrasesWithNoResults.length > 0 || phraseErrors.length > 0) && (
          <div className="empty-hint">
            {phrasesWithNoResults.length > 0 && <p>No results found for: {phrasesWithNoResults.join(', ')}</p>}
            {phraseErrors.map((entry) => (
              <p key={entry.phrase} className="error-text">
                &quot;{entry.phrase}&quot;: {entry.error}
              </p>
            ))}
          </div>
        )}
        <div className="generated-review-toolbar">
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
          {pendingOpportunities.map((draft) => (
            <li key={draft.id} className="idea-card">
              <div className="idea-card-main">
                <div className="idea-card-header">
                  <span className="idea-card-title">{draft.title || '(untitled opportunity)'}</span>
                  <span className="ai-badge">AI-synthesized — unverified</span>
                </div>
                {draft.hook && <p className="field-hint">Hook: {draft.hook}</p>}
                {draft.summary && <p className="idea-card-summary">{draft.summary}</p>}
                {draft.visualConcept && <p className="field-hint">Thumbnail concept: {draft.visualConcept}</p>}

                {draft.youtubeEvidence && <SupportingVideosDetails evidence={draft.youtubeEvidence} />}

                {draft.notes && (
                  <details className="research-picker-details">
                    <summary>Alternative titles, hooks, outline &amp; description draft</summary>
                    <pre className="opportunity-notes">{draft.notes}</pre>
                  </details>
                )}
              </div>
              <div className="idea-card-actions">
                <button type="button" onClick={() => onAccept(draft)}>
                  Accept into Ideas
                </button>
                <button type="button" className="danger-button" onClick={() => onDiscard(draft.id)}>
                  Discard
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="research-section opportunity-scout">
      <h2>Run automatic research</h2>
      <p className="tab-explanation">
        Enter one idea to research it, or let Farming discover ideas automatically. It searches lightweight web and
        reference results, reviews a few selected pages, samples only a handful of YouTube videos, ranks the ideas,
        and saves everything for future projects.
      </p>
      <label className="field">
        Idea or niche to research
        <input
          value={config.seedTopic}
          onChange={(event) => patchConfig({ seedTopic: event.target.value })}
          placeholder="e.g. simple hydroponics for apartment beginners"
          maxLength={200}
        />
      </label>
      <p className="field-hint">
        YouTube use is capped at one search and five videos. Broad web search activates when BRAVE_SEARCH_API_KEY is
        available; Wikipedia and the local AI engine work without it.
      </p>
      <div className="generated-review-toolbar">
        <button type="button" onClick={() => onFindOpportunities(config, 'topic')} disabled={!canSubmit}>
          {finding ? 'Researching...' : 'Research this idea'}
        </button>
        <button type="button" onClick={() => onFindOpportunities(config, 'discover')} disabled={!canSubmit}>
          Discover popular ideas automatically
        </button>
      </div>
      {researchJob && (
        <div className="research-progress" aria-live="polite">
          <div className="research-progress-header">
            <strong>{researchJob.stage}</strong>
            <span>{researchJob.progress}% · {researchJob.etaSeconds === null ? 'Calculating ETA' : researchJob.etaSeconds === 0 ? 'Complete' : `about ${researchJob.etaSeconds}s remaining`}</span>
          </div>
          <progress value={researchJob.progress} max={100}>{researchJob.progress}%</progress>
          <p className="field-hint">{researchJob.detail}</p>
          <ul className="research-provider-status">
            {Object.entries(researchJob.providers).map(([provider, state]) => (
              <li key={provider}>{providerLabels[provider as keyof ResearchJob['providers']]}: {state}</li>
            ))}
          </ul>
          {researchJob.state === 'completed' && researchJob.result && (
            <p className="success-text">Saved {researchJob.result.createdIdeaIds.length} ranked ideas. Open Ideas to approve or reject them.</p>
          )}
          {researchJob.error && <p className="error-text">{researchJob.error}</p>}
        </div>
      )}
      {findError && <p className="error-text">{findError}</p>}
    </section>
  )
}
