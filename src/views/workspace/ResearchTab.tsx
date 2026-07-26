import type { Idea, Research } from '../../../shared/schema/project'
import { ConfidentKeywordClassificationEditor } from '../../components/ConfidentKeywordClassificationEditor'
import { ConfidentTextList } from '../../components/ConfidentTextList'
import { EditableStringList } from '../../components/EditableStringList'
import { KeywordClassificationEditor } from '../../components/KeywordClassificationEditor'
import type { OpportunityScoutConfig } from '../../lib/api'
import type { ResearchJob } from '../../lib/api'
import { OpportunityScoutSection } from './OpportunityScoutSection'
import { SourceLinksEditor } from './SourceLinksEditor'
import { VerifiedFactsEditor } from './VerifiedFactsEditor'

type Props = {
  projectTopic: string
  research: Research
  onChangeResearch: (research: Research) => void
  onOrganize: () => void
  organizing: boolean
  organizeError: string | null
  onFindOpportunities: (config: OpportunityScoutConfig, mode?: 'topic' | 'discover') => void
  findingOpportunities: boolean
  findOpportunitiesError: string | null
  researchJob: ResearchJob | null
  pendingOpportunities: Idea[]
  opportunityPhrasesWithNoResults: string[]
  opportunityPhraseErrors: { phrase: string; error: string }[]
  onAcceptOpportunity: (idea: Idea) => void
  onAcceptAllOpportunities: () => void
  onDiscardOpportunity: (ideaId: string) => void
  onDiscardAllOpportunities: () => void
}

export function ResearchTab({
  projectTopic,
  research,
  onChangeResearch,
  onOrganize,
  organizing,
  organizeError,
  onFindOpportunities,
  findingOpportunities,
  findOpportunitiesError,
  researchJob,
  pendingOpportunities,
  opportunityPhrasesWithNoResults,
  opportunityPhraseErrors,
  onAcceptOpportunity,
  onAcceptAllOpportunities,
  onDiscardOpportunity,
  onDiscardAllOpportunities,
}: Props) {
  function patchResearch(patch: Partial<Research>) {
    onChangeResearch({ ...research, ...patch })
  }

  function patchAiExtracted(patch: Partial<Research['aiExtracted']>) {
    onChangeResearch({ ...research, aiExtracted: { ...research.aiExtracted, ...patch } })
  }

  return (
    <div className="research-tab">
      <OpportunityScoutSection
        projectTopic={projectTopic}
        onFindOpportunities={onFindOpportunities}
        finding={findingOpportunities}
        findError={findOpportunitiesError}
        researchJob={researchJob}
        pendingOpportunities={pendingOpportunities}
        phrasesWithNoResults={opportunityPhrasesWithNoResults}
        phraseErrors={opportunityPhraseErrors}
        onAccept={onAcceptOpportunity}
        onAcceptAll={onAcceptAllOpportunities}
        onDiscard={onDiscardOpportunity}
        onDiscardAll={onDiscardAllOpportunities}
      />

      <section className="research-section ai-section">
        <h2>Research library</h2>
        <p className="tab-explanation">
          Every automatic research run is saved here and automatically used when Farming generates future ideas and
          content.
        </p>
        {research.library.length > 0 && (
          <div className="research-library">
            <h3>Research library ({research.library.length})</h3>
            {research.library.map((run) => (
              <details key={run.id} className="research-picker-details">
                <summary>{run.topic} — {new Date(run.createdAt).toLocaleString()}</summary>
                <p>{run.summary}</p>
                <p className="field-hint">Saved in {run.relativePath}</p>
                {run.findings.length > 0 && <ul>{run.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>}
                <p>{run.sources.length} saved source{run.sources.length === 1 ? '' : 's'}</p>
                {run.sources.length > 0 && (
                  <ul className="idea-source-list">
                    {run.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.channelTitle}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <details className="research-picker-details">
        <summary>Manual research tools</summary>
      <section className="research-section">
        <h2>Your research</h2>

        <label className="field">
          Manual notes
          <textarea
            rows={8}
            value={research.manualNotes}
            onChange={(event) => patchResearch({ manualNotes: event.target.value })}
            placeholder="Write your own research notes here..."
          />
        </label>

        <label className="field">
          Pasted research
          <textarea
            rows={8}
            value={research.pastedResearch}
            onChange={(event) => patchResearch({ pastedResearch: event.target.value })}
            placeholder="Paste research copied from elsewhere..."
          />
        </label>

        <h3>Source links</h3>
        <SourceLinksEditor sources={research.sources} onChange={(sources) => patchResearch({ sources })} />

        <h3>Verified facts</h3>
        <VerifiedFactsEditor
          facts={research.verifiedFacts}
          sources={research.sources}
          onChange={(verifiedFacts) => patchResearch({ verifiedFacts })}
        />

        <KeywordClassificationEditor
          title="Your keywords"
          keywords={research.keywords}
          onChange={(keywords) => patchResearch({ keywords })}
        />

        <EditableStringList
          label="Competitor / content angles"
          items={research.competitorAngles}
          onChange={(competitorAngles) => patchResearch({ competitorAngles })}
        />
      </section>

      <section className="research-section ai-section">
        <div className="ai-section-header">
          <h2>AI-organized (unverified — review before use)</h2>
          <button type="button" onClick={onOrganize} disabled={organizing}>
            {organizing ? 'Organizing...' : 'Organize with AI'}
          </button>
        </div>
        {organizeError && <p className="error-text">{organizeError}</p>}

        <label className="field">
          AI-organized summary
          <textarea
            rows={6}
            value={research.organizedSummary}
            onChange={(event) => patchResearch({ organizedSummary: event.target.value })}
            placeholder='Click "Organize with AI" to generate a summary from your notes above.'
          />
        </label>

        <ConfidentKeywordClassificationEditor
          title="AI keyword suggestions"
          aiLabel="unverified"
          keywords={research.aiExtracted.keywords}
          onChange={(keywords) => patchAiExtracted({ keywords })}
        />

        <ConfidentTextList
          label="Competitor / content angles (AI-suggested)"
          badge="unverified"
          items={research.aiExtracted.competitorAngles}
          onChange={(competitorAngles) => patchAiExtracted({ competitorAngles })}
        />

        <ConfidentTextList
          label="Common questions"
          badge="unverified"
          items={research.aiExtracted.commonQuestions}
          onChange={(commonQuestions) => patchAiExtracted({ commonQuestions })}
        />

        <ConfidentTextList
          label="Beginner questions"
          badge="unverified"
          items={research.aiExtracted.beginnerQuestions}
          onChange={(beginnerQuestions) => patchAiExtracted({ beginnerQuestions })}
        />

        <ConfidentTextList
          label="Audience problems"
          badge="unverified"
          items={research.aiExtracted.audienceProblems}
          onChange={(audienceProblems) => patchAiExtracted({ audienceProblems })}
        />

        <ConfidentTextList
          label="Content gaps"
          badge="unverified"
          items={research.aiExtracted.contentGaps}
          onChange={(contentGaps) => patchAiExtracted({ contentGaps })}
        />

        <ConfidentTextList
          label="Estimated opportunities"
          badge="unverified"
          items={research.aiExtracted.estimatedOpportunities}
          onChange={(estimatedOpportunities) => patchAiExtracted({ estimatedOpportunities })}
        />
      </section>
      </details>
    </div>
  )
}
