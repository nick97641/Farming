import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getImageQualityPreset,
  getImageQualityPresetsForFamily,
  IMAGE_QUALITY_PRESETS,
  IMAGE_QUALITY_PRESETS_VERSION,
} from '../../shared/imageQualityPresets.ts'
import { DrawThingsSamplerSchema } from '../../shared/modelProfiles.ts'

test('image quality presets are centrally defined and versioned', () => {
  assert.equal(typeof IMAGE_QUALITY_PRESETS_VERSION, 'string')
  assert.ok(IMAGE_QUALITY_PRESETS.length > 0)
})

test('the SDXL/RealVisXL quality preset uses the exact tested settings', () => {
  const preset = getImageQualityPreset('sdxl-realvisxl-quality')
  assert.ok(preset)
  assert.equal(preset?.modelFamily, 'sdxl')
  assert.equal(preset?.sampler, 'DPM++ SDE Karras')
  assert.equal(preset?.steps, 32)
  assert.equal(preset?.guidanceScale, 5.0)
  assert.equal(preset?.clipSkip, 2)
  // Confirms the sampler is one of the Draw-Things-confirmed values, not a
  // typo that would be silently rejected by the generate route.
  assert.ok(DrawThingsSamplerSchema.safeParse(preset?.sampler).success)
})

test('getImageQualityPreset returns null for an unknown id rather than guessing a fallback', () => {
  assert.equal(getImageQualityPreset('does-not-exist'), null)
})

test('the SDXL preset is never offered for Z-Image or FLUX', () => {
  assert.deepEqual(getImageQualityPresetsForFamily('z-image'), [])
  assert.deepEqual(getImageQualityPresetsForFamily('flux'), [])
  assert.equal(getImageQualityPresetsForFamily('sdxl').length, 1)
  assert.equal(getImageQualityPresetsForFamily('sdxl')[0].id, 'sdxl-realvisxl-quality')
})

test('no preset specifies width, height, seed, or seedMode — dimensions and seed are never overridden by a preset', () => {
  for (const preset of IMAGE_QUALITY_PRESETS) {
    assert.ok(!('width' in preset))
    assert.ok(!('height' in preset))
    assert.ok(!('seed' in preset))
    assert.ok(!('seedMode' in preset))
  }
})
