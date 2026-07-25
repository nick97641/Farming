import type { Idea, Products, Project } from '../../../shared/schema/project'
import { downloadTextFile } from '../../lib/download'
import { buildProductTemplate, safeArtifactBaseName } from '../../lib/projectArtifacts'

type Props = {
  project: Project
  products: Products
  selectedIdea: Idea | null
  onChangeProducts: (products: Products) => void
  onExportPdf: () => void
}

export function ProductsTab({ project, products, selectedIdea, onChangeProducts, onExportPdf }: Props) {
  const pdfReady = Boolean(project.content.pdfDraft.trim())

  function prefillDescription() {
    if (!selectedIdea) return
    const description = [
      selectedIdea.summary,
      selectedIdea.targetAudience ? `For: ${selectedIdea.targetAudience}` : '',
      selectedIdea.proposedOutcome ? `Outcome: ${selectedIdea.proposedOutcome}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    onChangeProducts({ ...products, productDescription: description })
  }

  function downloadTemplate() {
    const base = safeArtifactBaseName(project.title)
    downloadTextFile(`${base}-product-template.md`, buildProductTemplate(project), 'text/markdown;charset=utf-8')
  }

  return (
    <div className="artifact-tab">
      <p className="tab-explanation">
        Prepare the reusable product materials associated with this project. Everything remains editable and local.
      </p>

      <section className="idea-editor-group">
        <h3>Product description</h3>
        <button type="button" onClick={prefillDescription} disabled={!selectedIdea}>
          Prefill from selected idea
        </button>
        <label className="field">
          Description
          <textarea
            rows={10}
            value={products.productDescription}
            onChange={(event) => onChangeProducts({ ...products, productDescription: event.target.value })}
          />
        </label>
      </section>

      <section className="idea-editor-group">
        <h3>PDF guide</h3>
        <p className={pdfReady ? 'field-hint' : 'empty-hint'}>
          {pdfReady
            ? 'The current PDF draft is ready to export as a finished guide.'
            : 'Create a PDF draft in Content before exporting a guide.'}
        </p>
        <button type="button" onClick={onExportPdf} disabled={!pdfReady}>
          Download PDF guide
        </button>
      </section>

      <section className="idea-editor-group">
        <h3>Reusable product template</h3>
        <p className="field-hint">
          Download an editable Markdown template populated from the selected idea and Design Brief.
        </p>
        <button type="button" onClick={downloadTemplate}>
          Download product template
        </button>
      </section>
    </div>
  )
}
