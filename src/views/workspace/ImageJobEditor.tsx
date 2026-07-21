import { useMemo, useState } from 'react'

import type {
  DesignBrief,
  ImageControl,
  ImageJob,
  ImageReferenceInfluence,
  ImageReferenceRole,
} from '../../../shared/schema/project'
import { getImageJobFileUrl } from '../../lib/api'
import { applyDestination, STATUS_OPTIONS } from '../../lib/imageJobOptions'
import { detectConflicts, enrichImageRequest, runFactualityGate } from '../../../shared/imageEnrichment'
import { DESTINATION_PRESETS, validateCustomDimensions } from '../../../shared/destinationPresets'
import { DRAW_THINGS_SAMPLERS, DRAW_THINGS_SCHEDULERS, getModelProfile, MODEL_PROFILES } from '../../../shared/modelProfiles'
import { influenceToWeight, roleToControlType } from '../../../shared/referenceGuidance'
import { ReferencePhotoManager } from './ReferencePhotoManager'

type Props = {
  projectId: string
  projectTitle: string
  projectTopic: string
  job: ImageJob
  designBrief: DesignBrief | null
  onChange: (job: ImageJob) => void
  onClose: () => void
  onDelete: () => void
  onImport: (file: File) => void
  importing: boolean
  importError: string | null
  onGenerate: (count: number) => void
  generating: boolean
  generateProgressLabel: string | null
  generateError: string | null
  onCancelGenerate: () => void
  canCancelGenerate: boolean
  onImportReference: (file: File, role: ImageReferenceRole, influence: ImageReferenceInfluence) => void
  onRemoveReference: (referenceId: string) => void
  referenceImporting: boolean
  referenceImportError: string | null
  onDuplicate: (job: ImageJob) => void
}

const IMAGE_COUNT_OPTIONS = [1, 2, 3, 4]

export function ImageJobEditor({
  projectId,
  job,
  designBrief,
  onChange,
  onClose,
  onDelete,
  onImport,
  importing,
  importError,
  onGenerate,
  generating,
  generateProgressLabel,
  generateError,
  onCancelGenerate,
  canCancelGenerate,
  onImportReference,
  onRemoveReference,
  referenceImporting,
  referenceImportError,
  onDuplicate,
}: Props) {
  const [missing, setMissing] = useState(false)
  const [showRecipeDetails, setShowRecipeDetails] = useState(false)
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  const [imageCount, setImageCount] = useState(1)
  const [customWidth, setCustomWidth] = useState(1024)
  const [customHeight, setCustomHeight] = useState(1024)
  const [customDimensionError, setCustomDimensionError] = useState<string | null>(null)
  // Draw Things' HTTP API can report which model it's currently using (read
  // separately, once, immediately before each generate call — see
  // effectiveModel below) but has no way for this app to SELECT it. There is
  // therefore no reliable pre-generation check to run; this is a blocking
  // human confirmation instead. Tracks the specific profile id it was given
  // for, not a plain boolean, so switching models forces re-confirmation.
  const [modelConfirmedFor, setModelConfirmedFor] = useState<string | null>(null)

  const stale = job.sourceDesignBriefUpdatedAt !== null && job.sourceDesignBriefUpdatedAt !== designBrief?.updatedAt
  const immutable = job.status === 'completed' || job.output !== null
  const modelProfile = getModelProfile(job.modelProfileId)

  function patch(fields: Partial<ImageJob>) {
    if (immutable) return
    onChange({ ...job, ...fields, updatedAt: new Date().toISOString() })
  }

  function patchStructured(fields: Partial<ImageJob['structuredRequirements']>) {
    patch({ structuredRequirements: { ...job.structuredRequirements, ...fields } })
  }

  function patchAdvanced(fields: Partial<ImageJob['advancedSettings']>) {
    patch({ advancedSettings: { ...job.advancedSettings, ...fields } })
  }

  // Re-run against whatever is CURRENTLY in prompt/negativePrompt — which may
  // have drifted from the recipe's own enrichedPrompt/enrichedNegativePrompt
  // through manual edits since — never trusting the stale stored snapshot.
  // This is the same deterministic gate the server independently enforces
  // before generation; this is only its live UI reflection.
  const liveFactualityCheck = useMemo(() => {
    if (!job.enrichmentRecipe) return null
    const conflicts = detectConflicts({
      factLocks: job.enrichmentRecipe.factLocks,
      freeformNegativePrompt: job.negativePrompt,
    })
    return runFactualityGate({
      factLocks: job.enrichmentRecipe.factLocks,
      effectivePrompt: job.prompt,
      effectiveNegativePrompt: job.negativePrompt,
      conflicts,
      unresolvedDetails: job.enrichmentRecipe.result.unresolvedDetails,
    })
  }, [job.enrichmentRecipe, job.prompt, job.negativePrompt])

  function handleRunEnrichment() {
    // Merges in the selected model's own safe negative defaults alongside
    // the policy-derived prohibitions and the user's own negative prompt —
    // never replacing either — and the same conflict detector guards the
    // merge against contradicting a locked required fact.
    const recipe = enrichImageRequest({
      userDescription: job.userDescription,
      freeformNegativePrompt: job.negativePrompt,
      structuredRequirements: job.structuredRequirements,
    })
    const mergedNegative = [
      job.negativePrompt.trim(),
      recipe.result.enrichedNegativePrompt,
      ...modelProfile.safeNegativeDefaults,
    ]
      .filter(Boolean)
      .join(', ')
    patch({
      enrichmentRecipe: recipe,
      prompt: recipe.result.enrichedPrompt,
      negativePrompt: mergedNegative,
    })
  }

  function handleResetToSource() {
    if (!window.confirm('Reset the prompt back to your original description? This discards the current enrichment.')) {
      return
    }
    patch({ prompt: job.userDescription, negativePrompt: '', enrichmentRecipe: null })
  }

  function handleDestinationChange(presetId: string) {
    if (presetId === 'custom') {
      const error = validateCustomDimensions(customWidth, customHeight)
      setCustomDimensionError(error)
      if (error) return
      onChange(applyDestination(job, presetId, { width: customWidth, height: customHeight }))
      return
    }
    setCustomDimensionError(null)
    onChange(applyDestination(job, presetId))
  }

  function toggleControlForReference(referenceId: string, role: ImageReferenceRole) {
    const type = roleToControlType(role)
    if (!type) return
    const existing = job.controls.find((c) => c.referenceId === referenceId)
    if (existing) {
      patch({ controls: job.controls.filter((c) => c.referenceId !== referenceId) })
      return
    }
    const reference = job.references.find((r) => r.id === referenceId)
    const newControl: ImageControl = {
      id: crypto.randomUUID(),
      type,
      referenceId,
      weight: influenceToWeight(reference?.influence ?? 'medium'),
      preprocessing: true,
      start: 0,
      end: 1,
    }
    patch({ controls: [...job.controls, newControl] })
  }

  const canGenerate =
    !generating &&
    !importing &&
    job.prompt.trim().length > 0 &&
    liveFactualityCheck?.status !== 'blocked' &&
    modelConfirmedFor === job.modelProfileId

  return (
    <div className="idea-editor">
      <div className="idea-editor-toolbar">
        <button type="button" onClick={onClose}>
          &larr; Back to image jobs
        </button>
        <div>
          <button type="button" onClick={() => setMode(mode === 'simple' ? 'advanced' : 'simple')}>
            {mode === 'simple' ? 'Switch to Advanced' : 'Switch to Simple'}
          </button>
          <button type="button" className="danger-button" onClick={onDelete}>
            Delete image job
          </button>
        </div>
      </div>

      {stale && (
        <p className="design-brief-mismatch-warning">
          The Design Brief has changed since this job was created. The prompt below will not update automatically —
          review it against the current brief if needed.
        </p>
      )}

      {immutable && (
        <p className="empty-hint">This completed job is immutable. Duplicate it to create another variation.</p>
      )}

      {/* 1. Where will this image be used? */}
      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Where will this image be used?</h3>
        <label className="field">
          Destination
          <select value={job.destination?.presetId ?? ''} onChange={(event) => handleDestinationChange(event.target.value)}>
            <option value="" disabled>
              Choose a destination...
            </option>
            {DESTINATION_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        {job.destination?.presetId === 'custom' && (
          <div className="image-job-dimensions">
            <label className="field">
              Custom width
              <input type="number" value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} />
            </label>
            <label className="field">
              Custom height
              <input type="number" value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} />
            </label>
            <button type="button" onClick={() => handleDestinationChange('custom')}>
              Apply custom size
            </button>
          </div>
        )}
        {customDimensionError && <p className="error-text">{customDimensionError}</p>}
        {job.destination && (
          <p className="field-hint">
            {job.destination.compositionGuidance} Final export size: {job.destination.exportWidth}×
            {job.destination.exportHeight} ({job.destination.orientation}
            {job.destination.cropBehavior !== 'none' ? `, ${job.destination.cropBehavior} to fit` : ''}). Preset version{' '}
            {job.destination.presetVersion}.
          </p>
        )}
      </fieldset>

      {/* 2 & 3: Describe the image / What should it avoid */}
      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Describe the image</h3>
        <label className="field">
          Description
          <textarea
            rows={3}
            value={job.userDescription}
            onChange={(event) => patch({ userDescription: event.target.value })}
            placeholder="Describe what should appear in the image, in your own words."
          />
        </label>
        <label className="field">
          What should the image avoid? (optional)
          <textarea
            rows={2}
            value={job.negativePrompt}
            onChange={(event) => patch({ negativePrompt: event.target.value })}
            placeholder="Ordinary phrases are fine, e.g. no people, no clutter."
          />
        </label>

        <details className="research-picker-details">
          <summary>Factual details (used by the enhancement below)</summary>
          <p className="tab-explanation">
            Governed by policy <strong>factual-image-enrichment-v1</strong>. Only what you enter here or in the
            description above is ever treated as a fact — nothing is invented to fill a gap.
          </p>
          <label className="field">
            Plant count
            <input
              type="number"
              min={0}
              value={job.structuredRequirements.plantCount ?? ''}
              onChange={(event) =>
                patchStructured({ plantCount: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Plant species
            <input
              value={job.structuredRequirements.plantSpecies}
              onChange={(event) => patchStructured({ plantSpecies: event.target.value })}
            />
          </label>
          <label className="field">
            Hydroponic method
            <input
              value={job.structuredRequirements.hydroponicMethod}
              onChange={(event) => patchStructured({ hydroponicMethod: event.target.value })}
            />
          </label>
          <label className="field">
            Container type
            <input
              value={job.structuredRequirements.containerType}
              onChange={(event) => patchStructured({ containerType: event.target.value })}
            />
          </label>
          <label className="field">
            Container transparency
            <select
              value={job.structuredRequirements.containerTransparency}
              onChange={(event) =>
                patchStructured({
                  containerTransparency: event.target.value as ImageJob['structuredRequirements']['containerTransparency'],
                })
              }
            >
              <option value="unspecified">Not specified</option>
              <option value="transparent">Transparent</option>
              <option value="opaque">Opaque</option>
            </select>
          </label>
          <label className="field">
            Waterline
            <input
              value={job.structuredRequirements.waterline}
              onChange={(event) => patchStructured({ waterline: event.target.value })}
            />
          </label>
          <label className="field">
            Air gap
            <input value={job.structuredRequirements.airGap} onChange={(event) => patchStructured({ airGap: event.target.value })} />
          </label>
          <label className="field">
            Submerged root region
            <input
              value={job.structuredRequirements.submergedRootRegion}
              onChange={(event) => patchStructured({ submergedRootRegion: event.target.value })}
            />
          </label>
          <label className="field">
            Dry / aerial root region
            <input
              value={job.structuredRequirements.dryRootRegion}
              onChange={(event) => patchStructured({ dryRootRegion: event.target.value })}
            />
          </label>
          <label className="field">
            Plant crown position
            <input
              value={job.structuredRequirements.crownPosition}
              onChange={(event) => patchStructured({ crownPosition: event.target.value })}
            />
          </label>
          <label className="field">
            Requested viewing angle
            <input
              value={job.structuredRequirements.viewingAngle}
              onChange={(event) => patchStructured({ viewingAngle: event.target.value })}
            />
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.structuredRequirements.allowVisibleText}
              onChange={(event) => patchStructured({ allowVisibleText: event.target.checked })}
            />
            Allow visible text/labels in the image
          </label>
        </details>

        <button type="button" onClick={handleRunEnrichment}>
          Enhance description
        </button>
        {!immutable && job.enrichmentRecipe && (
          <button type="button" onClick={handleResetToSource}>
            Reset to source
          </button>
        )}
      </fieldset>

      {/* 4. Reference photos */}
      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Add reference photos (optional)</h3>
        <ReferencePhotoManager
          projectId={projectId}
          jobId={job.id}
          references={job.references}
          disabled={immutable}
          onImport={onImportReference}
          onRemove={onRemoveReference}
          importing={referenceImporting}
          importError={referenceImportError}
        />
      </fieldset>

      {/* 5. Number of images */}
      <fieldset className="idea-editor-group" disabled={immutable}>
        <h3>Number of images</h3>
        <label className="field">
          How many variations?
          <select value={imageCount} onChange={(event) => setImageCount(Number(event.target.value))}>
            {IMAGE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <p className="field-hint">
          Each image is generated one at a time and kept as its own variation — nothing is overwritten.
        </p>
      </fieldset>

      {/* 6 & 7: Enhanced-prompt preview + factuality summary */}
      {job.enrichmentRecipe && liveFactualityCheck && (
        <section className={`idea-editor-group factuality-check factuality-${liveFactualityCheck.status}`}>
          <h3>Enhanced description &amp; factuality check</h3>
          <p className="field-hint">
            <strong>Enhanced prompt:</strong> {job.prompt}
          </p>
          <ul className="factuality-summary">
            <li>{liveFactualityCheck.requiredFactsPreserved ? '✓' : '✗'} Required facts preserved</li>
            <li>{liveFactualityCheck.noContradictions ? '✓' : '✗'} No contradictions detected</li>
            <li>{liveFactualityCheck.noUnsupportedAdditions ? '✓' : '✗'} No unsupported additions detected</li>
          </ul>
          {liveFactualityCheck.unresolvedDetails.length > 0 && (
            <div className="field-hint">
              Unresolved details:
              <ul>
                {liveFactualityCheck.unresolvedDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
          {liveFactualityCheck.status === 'blocked' && (
            <div className="error-text">
              Generation blocked:
              <ul>
                {liveFactualityCheck.blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="field-hint">This certifies the request recipe, not the generated image — review the result yourself.</p>

          <details
            className="research-picker-details"
            open={showRecipeDetails}
            onToggle={(e) => setShowRecipeDetails(e.currentTarget.open)}
          >
            <summary>Inspect recipe details</summary>
            <p>
              <strong>Original description:</strong> {job.enrichmentRecipe.originalDescription || '(none)'}
            </p>
            <p>
              <strong>Enriched negative prompt:</strong> {job.enrichmentRecipe.result.enrichedNegativePrompt}
            </p>
            <p>
              <strong>Styling additions:</strong> {job.enrichmentRecipe.result.stylingAdditions.join(', ')}
            </p>
            <p>
              <strong>Policy:</strong> {job.enrichmentRecipe.policyVersion} · <strong>Profile:</strong>{' '}
              {job.enrichmentRecipe.profileVersion}
            </p>
            <ul className="idea-source-list">
              {job.enrichmentRecipe.factLocks.map((lock) => (
                <li key={lock.id}>
                  <span>
                    [{lock.requirement}/{lock.category}] {lock.statement} <em>({lock.source})</em>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {/* 8. Generate */}
      <section className="idea-editor-group">
        <h3>Image</h3>
        {job.output ? (
          <>
            {!missing && (
              <img
                className="image-job-preview"
                src={getImageJobFileUrl(projectId, job.id)}
                alt={job.label || 'Image job output'}
                onError={() => setMissing(true)}
              />
            )}
            {missing && <p className="error-text">File missing from disk</p>}
            {job.originalFilename && <p className="field-hint">Originally uploaded as: {job.originalFilename}</p>}
            <p className="field-hint">
              Seed: {job.advancedSettings.seed} · {job.width}×{job.height}
              {job.destination ? ` · ${job.destination.label}` : ''}
            </p>
            <p className="field-hint">
              Requested model: {modelProfile.label}.{' '}
              {job.effectiveModel
                ? `Draw Things reported using: ${job.effectiveModel}.`
                : "Draw Things did not report which model it used — this app has no way to confirm the two match."}
            </p>
            <button type="button" onClick={() => onDuplicate(job)}>
              Duplicate as new variation
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <input
                type="checkbox"
                checked={modelConfirmedFor === job.modelProfileId}
                onChange={(event) => setModelConfirmedFor(event.target.checked ? job.modelProfileId : null)}
              />
              I've confirmed <strong>{modelProfile.label}</strong> is the model currently active in Draw Things — this
              app cannot select or verify it for you.
            </label>
            <button type="button" onClick={() => onGenerate(imageCount)} disabled={!canGenerate}>
              {generating ? generateProgressLabel ?? 'Generating...' : `Generate ${imageCount > 1 ? `${imageCount} images` : 'image'}`}
            </button>
            {generating && canCancelGenerate && (
              <button type="button" onClick={onCancelGenerate}>
                Cancel remaining
              </button>
            )}
            {liveFactualityCheck?.status === 'blocked' && (
              <p className="error-text">Generate is disabled until the factuality check above passes.</p>
            )}
            {generateError && <p className="error-text">{generateError}</p>}
            <p className="field-hint">Or import an image you created elsewhere:</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImport(file)
                event.target.value = ''
              }}
              disabled={importing}
            />
            {importing && <p>Importing...</p>}
            {importError && <p className="error-text">{importError}</p>}
          </>
        )}
      </section>

      {/* 9. Advanced settings, collapsed */}
      <details className="research-picker-details">
        <summary>Advanced settings</summary>
        <fieldset className="idea-editor-group" disabled={immutable}>
          <label className="field">
            Label
            <input value={job.label} onChange={(event) => patch({ label: event.target.value })} />
          </label>
          <label className="field">
            Status
            <select value={job.status} onChange={(event) => patch({ status: event.target.value as ImageJob['status'] })}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Model
            <select value={job.modelProfileId} onChange={(event) => patch({ modelProfileId: event.target.value })}>
              {MODEL_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
          <div className="image-job-dimensions">
            <label className="field">
              Native width
              <input type="number" min={1} value={job.width} onChange={(event) => patch({ width: Number(event.target.value) || job.width })} />
            </label>
            <label className="field">
              Native height
              <input
                type="number"
                min={1}
                value={job.height}
                onChange={(event) => patch({ height: Number(event.target.value) || job.height })}
              />
            </label>
          </div>
          {job.destination && (
            <p className="field-hint">
              Target export size: {job.destination.exportWidth}×{job.destination.exportHeight}
            </p>
          )}
          <label className="field">
            Sampler
            <select
              value={job.advancedSettings.sampler}
              onChange={(event) => patchAdvanced({ sampler: event.target.value as ImageJob['advancedSettings']['sampler'] })}
            >
              {DRAW_THINGS_SAMPLERS.map((sampler) => (
                <option key={sampler} value={sampler}>
                  {sampler === 'default' ? "Draw Things' default" : sampler}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Scheduler
            <select
              value={job.advancedSettings.scheduler}
              onChange={(event) => patchAdvanced({ scheduler: event.target.value as ImageJob['advancedSettings']['scheduler'] })}
            >
              {DRAW_THINGS_SCHEDULERS.map((scheduler) => (
                <option key={scheduler} value={scheduler}>
                  {scheduler === 'default' ? "Draw Things' default" : scheduler}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            Draw Things has no separate scheduler parameter — scheduling is selected as part of the sampler itself
            (the "Karras"/"Trailing"/"AYS" options above), so scheduler only ever has one working value here.
          </p>
          <label className="field">
            Steps
            <input
              type="number"
              value={job.advancedSettings.steps}
              onChange={(event) => patchAdvanced({ steps: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Guidance
            <input
              type="number"
              step={0.1}
              value={job.advancedSettings.guidanceScale}
              onChange={(event) => patchAdvanced({ guidanceScale: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Seed mode
            <select
              value={job.advancedSettings.seedMode}
              onChange={(event) => patchAdvanced({ seedMode: event.target.value as ImageJob['advancedSettings']['seedMode'] })}
            >
              <option value="random">Random</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          {job.advancedSettings.seedMode === 'fixed' && (
            <label className="field">
              Seed
              <input
                type="number"
                value={job.advancedSettings.seed}
                onChange={(event) => patchAdvanced({ seed: Number(event.target.value) })}
              />
            </label>
          )}
          <label className="field">
            CLIP skip
            <input
              type="number"
              value={job.advancedSettings.clipSkip}
              onChange={(event) => patchAdvanced({ clipSkip: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Shift
            <input
              type="number"
              step={0.1}
              value={job.advancedSettings.shift}
              onChange={(event) => patchAdvanced({ shift: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.refinerEnabled}
              onChange={(event) => patchAdvanced({ refinerEnabled: event.target.checked })}
            />
            Refiner
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.upscalerEnabled}
              onChange={(event) => patchAdvanced({ upscalerEnabled: event.target.checked })}
            />
            Upscaler
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.highResFixEnabled}
              onChange={(event) => patchAdvanced({ highResFixEnabled: event.target.checked })}
            />
            High-res fix
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.faceRestorationEnabled}
              onChange={(event) => patchAdvanced({ faceRestorationEnabled: event.target.checked })}
            />
            Face restoration
          </label>
          <label className="field">
            Sharpness
            <input
              type="number"
              step={0.1}
              value={job.advancedSettings.sharpness}
              onChange={(event) => patchAdvanced({ sharpness: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.tiledDecodingEnabled}
              onChange={(event) => patchAdvanced({ tiledDecodingEnabled: event.target.checked })}
            />
            Tiled decoding
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={job.advancedSettings.tiledDiffusionEnabled}
              onChange={(event) => patchAdvanced({ tiledDiffusionEnabled: event.target.checked })}
            />
            Tiled diffusion
          </label>
          <p className="field-hint">
            Sampler/steps/guidance/seed are sent to Draw Things (scheduler is recorded but never sent — see above).
            CLIP skip, shift, refiner, upscaler, high-res fix, face restoration, sharpness, and tiled
            decoding/diffusion are recorded for reproducibility but not yet forwarded — their Draw Things wire format
            hasn&apos;t been verified against a live instance.
          </p>

          {job.references.length > 0 && (
            <>
              <h4>Controls</h4>
              {job.references.map((reference) => {
                const type = roleToControlType(reference.role)
                if (!type) return null
                const currentModel = getModelProfile(job.modelProfileId)
                const modelSupports = type === 'canny' ? currentModel.supportsCanny : currentModel.supportsDepth
                const enabled = job.controls.some((c) => c.referenceId === reference.id)
                return (
                  <label className="field" key={reference.id}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={!modelSupports}
                      onChange={() => toggleControlForReference(reference.id, reference.role)}
                    />
                    {type === 'canny' ? 'Canny (edges/layout)' : 'Depth (structure/depth)'} from reference{' '}
                    {reference.originalFilename ?? reference.id.slice(0, 8)}
                    {!modelSupports && ` — not supported by ${currentModel.label}`}
                  </label>
                )
              })}
            </>
          )}
        </fieldset>
      </details>
    </div>
  )
}
