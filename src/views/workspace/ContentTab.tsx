import type { ContentGenerationTarget } from '../../lib/api'
import type { Content, DesignBrief } from '../../../shared/schema/project'

type Props = {
  designBrief: DesignBrief | null
  content: Content
  onChangeContent: (content: Content) => void
  onGenerate: (target: ContentGenerationTarget) => void
  onExportPdf: () => void
  generatingTarget: ContentGenerationTarget | null
  generateError: string | null
  exportingPdf: boolean
  exportPdfError: string | null
}

// Exactly two editable sections for the minimal launch — YouTube script and
// PDF draft. shorts/shotList/thumbnailIdeas/captions have no generation path
// or editor yet; they are preserved untouched on `content` by every update
// here (only longFormScript/pdfDraft are ever patched).
export function ContentTab({
  designBrief,
  content,
  onChangeContent,
  onGenerate,
  onExportPdf,
  generatingTarget,
  generateError,
  exportingPdf,
  exportPdfError,
}: Props) {
  function requestGenerate(target: ContentGenerationTarget) {
    const existing = target === 'youtube-script' ? content.longFormScript : content.pdfDraft
    if (existing.trim()) {
      const label = target === 'youtube-script' ? 'YouTube script' : 'PDF draft'
      if (!window.confirm(`Generating will replace the current ${label} text. Continue?`)) return
    }
    onGenerate(target)
  }

  if (!designBrief) {
    return (
      <div className="content-tab">
        <p className="tab-explanation">
          Generate a YouTube script or a PDF guide draft from your Design Brief.
        </p>
        <p className="empty-hint">
          No Design Brief exists yet. Go to the Design Brief tab and create one from your selected idea before
          generating content here.
        </p>
      </div>
    )
  }

  return (
    <div className="content-tab">
      <p className="tab-explanation">
        Generate a YouTube script or a PDF guide draft from your Design Brief, then edit freely — nothing is
        overwritten by generation without your confirmation.
      </p>

      <section className="idea-editor-group">
        <h3>YouTube Script</h3>
        <button
          type="button"
          onClick={() => requestGenerate('youtube-script')}
          disabled={generatingTarget !== null}
        >
          {generatingTarget === 'youtube-script' ? 'Generating...' : 'Generate with AI'}
        </button>
        <label className="field">
          Script
          <textarea
            rows={16}
            value={content.longFormScript}
            onChange={(event) => onChangeContent({ ...content, longFormScript: event.target.value })}
            disabled={generatingTarget === 'youtube-script'}
          />
        </label>
      </section>

      <section className="idea-editor-group">
        <h3>PDF Draft</h3>
        <button type="button" onClick={() => requestGenerate('pdf-draft')} disabled={generatingTarget !== null}>
          {generatingTarget === 'pdf-draft' ? 'Generating...' : 'Generate with AI'}
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={generatingTarget !== null || exportingPdf || !content.pdfDraft.trim()}
        >
          {exportingPdf ? 'Exporting...' : 'Export PDF'}
        </button>
        <label className="field">
          Draft
          <textarea
            rows={16}
            value={content.pdfDraft}
            onChange={(event) => onChangeContent({ ...content, pdfDraft: event.target.value })}
            disabled={generatingTarget === 'pdf-draft'}
          />
        </label>
      </section>

      {generateError && <p className="error-text">{generateError}</p>}
      {exportPdfError && <p className="error-text">{exportPdfError}</p>}
    </div>
  )
}
