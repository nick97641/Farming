import { useState } from 'react'

import type { Idea, YoutubeOpportunityEvidence } from '../../../shared/schema/project'
import type { OpportunityScoutConfig } from '../../lib/api'

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
  onFindOpportunities: (config: OpportunityScoutConfig) => void
  finding: boolean
  findError: string | null
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
  onFindOpportunities,
  finding,
  findError,
  pendingOpportunities,
  phrasesWithNoResults,
  phraseErrors,
  onAccept,
  onAcceptAll,
  onDiscard,
  onDiscardAll,
}: Props) {
  const [config, setConfig] = useState<OpportunityScoutConfig>(DEFAULT_CONFIG)

  function patchConfig(patch: Partial<OpportunityScoutConfig>) {
    setConfig((current) => ({ ...current, ...patch }))
  }

  const canSubmit = config.seedTopic.trim().length > 0 && !finding

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
      <h2>YouTube Opportunity Scout</h2>
      <p className="tab-explanation">
        Search real, recent YouTube videos in your niche for evidence-backed content opportunities — topics, titles,
        hooks, and thumbnail ideas grounded in actual public metrics, not guesses. Uses the official YouTube Data
        API and your local Ollama model; nothing is added to your Ideas list until you review and accept it.
      </p>
      <label className="field">
        Niche or seed topic
        <input
          value={config.seedTopic}
          onChange={(event) => patchConfig({ seedTopic: event.target.value })}
          placeholder="e.g. beginner deep water culture hydroponics"
          maxLength={200}
        />
      </label>
      <div className="opportunity-scout-config-row">
        <label className="field">
          Country/region
          <input
            value={config.regionCode}
            onChange={(event) => patchConfig({ regionCode: event.target.value.toUpperCase() })}
            maxLength={2}
            placeholder="US"
          />
        </label>
        <label className="field">
          Language
          <input
            value={config.languageCode}
            onChange={(event) => patchConfig({ languageCode: event.target.value.toLowerCase() })}
            maxLength={5}
            placeholder="en"
          />
        </label>
        <label className="field">
          Published within (days)
          <input
            type="number"
            min={1}
            max={365}
            value={config.publishedAfterDays}
            onChange={(event) => patchConfig({ publishedAfterDays: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          Search phrases
          <input
            type="number"
            min={1}
            max={5}
            value={config.maxSearchPhrases}
            onChange={(event) => patchConfig({ maxSearchPhrases: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          Results per phrase
          <input
            type="number"
            min={1}
            max={25}
            value={config.maxResultsPerPhrase}
            onChange={(event) => patchConfig({ maxResultsPerPhrase: Number(event.target.value) })}
          />
        </label>
      </div>
      <p className="field-hint">
        Uses up to {config.maxSearchPhrases} YouTube searches per run (~{config.maxSearchPhrases * 100} of your daily
        quota units) plus two local Ollama calls. Requires YOUTUBE_API_KEY to be set on the local server.
      </p>
      <button type="button" onClick={() => onFindOpportunities(config)} disabled={!canSubmit}>
        {finding ? 'Finding opportunities...' : 'Find opportunities'}
      </button>
      {findError && <p className="error-text">{findError}</p>}
    </section>
  )
}
