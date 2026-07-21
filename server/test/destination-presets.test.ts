import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DESTINATION_PRESETS,
  DESTINATION_PRESETS_VERSION,
  getDestinationPreset,
  resolveNativeDimensions,
  validateCustomDimensions,
} from '../../shared/destinationPresets.ts'
import { getModelProfile, MODEL_PROFILES, MODEL_PROFILES_VERSION, supportsControl } from '../../shared/modelProfiles.ts'
import { influenceToWeight, roleToControlType, suggestControlForReference } from '../../shared/referenceGuidance.ts'

test('destination presets are centrally defined and versioned', () => {
  assert.equal(typeof DESTINATION_PRESETS_VERSION, 'string')
  assert.ok(DESTINATION_PRESETS.length > 0)
  const ids = DESTINATION_PRESETS.map((p) => p.id)
  assert.ok(ids.includes('instagram-square'))
  assert.ok(ids.includes('youtube-thumbnail'))
  assert.ok(ids.includes('custom'))
})

test('destination-to-aspect-ratio mapping matches each preset export size', () => {
  for (const preset of DESTINATION_PRESETS) {
    const expectedRatio = preset.exportWidth / preset.exportHeight
    const presetRatio = preset.aspectRatio.width / preset.aspectRatio.height
    assert.ok(
      Math.abs(expectedRatio - presetRatio) < 0.05,
      `${preset.id}: aspect ratio ${presetRatio} should match export size ratio ${expectedRatio}`,
    )
  }
})

test('getDestinationPreset falls back to the first preset for an unknown id', () => {
  const preset = getDestinationPreset('does-not-exist')
  assert.equal(preset.id, DESTINATION_PRESETS[0].id)
})

test('native generation dimensions are separate from export dimensions and model-compatible', () => {
  const sdxl = getModelProfile('sdxl-base')
  const preset = getDestinationPreset('instagram-story') // 9:16, export 1080x1920
  const native = resolveNativeDimensions(preset.aspectRatio, sdxl)

  assert.notEqual(native.width, preset.exportWidth)
  assert.notEqual(native.height, preset.exportHeight)
  assert.equal(native.width % sdxl.dimensionStep, 0)
  assert.equal(native.height % sdxl.dimensionStep, 0)
  assert.ok(native.width >= sdxl.minDimension && native.width <= sdxl.maxDimension)
  assert.ok(native.height >= sdxl.minDimension && native.height <= sdxl.maxDimension)

  // Aspect ratio is preserved as closely as the dimension step allows.
  const nativeRatio = native.width / native.height
  const presetRatio = preset.aspectRatio.width / preset.aspectRatio.height
  assert.ok(Math.abs(nativeRatio - presetRatio) < 0.1)
})

test('resolveNativeDimensions never exceeds the given model profile limits', () => {
  const tinyModel = { minDimension: 256, maxDimension: 512, dimensionStep: 64 }
  const wideAspect = { width: 21, height: 9 }
  const native = resolveNativeDimensions(wideAspect, tinyModel)
  assert.ok(native.width <= tinyModel.maxDimension)
  assert.ok(native.height <= tinyModel.maxDimension)
  assert.ok(native.width >= tinyModel.minDimension)
  assert.ok(native.height >= tinyModel.minDimension)
})

test('validateCustomDimensions rejects invalid custom dimensions', () => {
  assert.equal(validateCustomDimensions(1.5, 100), 'Width and height must be whole numbers.')
  assert.match(validateCustomDimensions(10, 100) ?? '', /at least/)
  assert.match(validateCustomDimensions(100, 100000) ?? '', /at most/)
})

test('validateCustomDimensions accepts valid custom dimensions', () => {
  assert.equal(validateCustomDimensions(1024, 768), null)
})

test('model profiles registry is centrally defined and versioned', () => {
  assert.equal(typeof MODEL_PROFILES_VERSION, 'string')
  assert.ok(MODEL_PROFILES.length > 0)
})

test('Canny/Depth controls are only offered for compatible SDXL-family models', () => {
  const sdxl = getModelProfile('sdxl-base')
  const zImage = getModelProfile('z-image')
  const flux = getModelProfile('flux')

  assert.equal(supportsControl(sdxl, 'canny'), true)
  assert.equal(supportsControl(sdxl, 'depth'), true)
  assert.equal(supportsControl(zImage, 'canny'), false)
  assert.equal(supportsControl(zImage, 'depth'), false)
  assert.equal(supportsControl(flux, 'canny'), false)
  assert.equal(supportsControl(flux, 'depth'), false)
})

test('reference-role translation maps roles to the correct control type', () => {
  assert.equal(roleToControlType('match-edges-layout'), 'canny')
  assert.equal(roleToControlType('match-composition'), 'canny')
  assert.equal(roleToControlType('match-structure-depth'), 'depth')
  assert.equal(roleToControlType('match-subject'), null)
  assert.equal(roleToControlType('match-style'), null)
  assert.equal(roleToControlType('general-inspiration'), null)
})

test('influence-to-weight translation is monotonic low < medium < high', () => {
  const low = influenceToWeight('low')
  const medium = influenceToWeight('medium')
  const high = influenceToWeight('high')
  assert.ok(low < medium)
  assert.ok(medium < high)
})

test('suggestControlForReference never enables a control an incompatible model does not support', () => {
  const zImage = getModelProfile('z-image')
  const suggestion = suggestControlForReference('match-edges-layout', 'high', zImage)
  assert.equal(suggestion, null)
})

test('suggestControlForReference returns a complete, visible suggestion for a compatible model', () => {
  const sdxl = getModelProfile('sdxl-base')
  const suggestion = suggestControlForReference('match-structure-depth', 'high', sdxl)
  assert.ok(suggestion)
  assert.equal(suggestion?.type, 'depth')
  assert.equal(suggestion?.weight, influenceToWeight('high'))
})
