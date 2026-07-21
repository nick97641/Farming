import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DrawThingsGenerationError,
  buildDrawThingsPayload,
  decodeDrawThingsImage,
  generateWithDrawThings,
} from '../lib/draw-things-client.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

test('buildDrawThingsPayload maps Farming image requirements to the local HTTP API', () => {
  assert.deepEqual(
    buildDrawThingsPayload({ prompt: '  lettuce bucket  ', negativePrompt: ' blur ', width: 1152, height: 640 }),
    {
      prompt: 'lettuce bucket',
      negative_prompt: 'blur',
      width: 1152,
      height: 640,
      steps: 28,
      guidance_scale: 6.5,
      seed: -1,
      batch_count: 1,
      batch_size: 1,
    },
  )
})

test('buildDrawThingsPayload forwards steps, guidance scale, and an explicit seed when supplied', () => {
  const payload = buildDrawThingsPayload({
    prompt: 'lettuce bucket',
    negativePrompt: 'blur',
    width: 1024,
    height: 1024,
    steps: 40,
    guidanceScale: 8.2,
    seed: 12345,
  })
  assert.equal(payload.steps, 40)
  assert.equal(payload.guidance_scale, 8.2)
  assert.equal(payload.seed, 12345)
})

test('buildDrawThingsPayload includes sampler_name/scheduler only when explicitly supplied', () => {
  const withoutThem = buildDrawThingsPayload({ prompt: 'a', negativePrompt: '', width: 1024, height: 1024 })
  assert.equal('sampler_name' in withoutThem, false)
  assert.equal('scheduler' in withoutThem, false)

  const withThem = buildDrawThingsPayload({
    prompt: 'a',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sampler: 'euler_a',
    scheduler: 'karras',
  })
  assert.equal(withThem.sampler_name, 'euler_a')
  assert.equal(withThem.scheduler, 'karras')
})

test('buildDrawThingsPayload omits alwayson_scripts.controlnet entirely when there are no controls', () => {
  const payload = buildDrawThingsPayload({ prompt: 'a', negativePrompt: '', width: 1024, height: 1024, controls: [] })
  assert.equal('alwayson_scripts' in payload, false)
})

test('buildDrawThingsPayload maps each control into a controlnet arg entry, preserving order and mapping preprocessing to processor_res', () => {
  const payload = buildDrawThingsPayload({
    prompt: 'a',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    controls: [
      { type: 'canny', imageBase64: 'AAA', weight: 0.6, preprocessing: true, start: 0, end: 1 },
      { type: 'depth', imageBase64: 'BBB', weight: 0.9, preprocessing: false, start: 0.1, end: 0.8 },
    ],
  })
  const controlnet = (payload as { alwayson_scripts: { controlnet: { args: unknown[] } } }).alwayson_scripts.controlnet
  assert.deepEqual(controlnet.args, [
    { input_image: 'AAA', module: 'canny', weight: 0.6, processor_res: 512, guidance_start: 0, guidance_end: 1 },
    { input_image: 'BBB', module: 'depth', weight: 0.9, processor_res: 0, guidance_start: 0.1, guidance_end: 0.8 },
  ])
})

test('decodeDrawThingsImage accepts plain base64 and data URLs', () => {
  assert.deepEqual(decodeDrawThingsImage(PNG.toString('base64')), PNG)
  assert.deepEqual(decodeDrawThingsImage(`data:image/png;base64,${PNG.toString('base64')}`), PNG)
})

test('generateWithDrawThings returns the first decoded image', async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ images: [PNG.toString('base64')] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  assert.deepEqual(
    await generateWithDrawThings({ prompt: 'lettuce', negativePrompt: '', width: 1024, height: 1024 }, fakeFetch),
    PNG,
  )
})

test('generateWithDrawThings reports malformed API responses cleanly', async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ images: [] }), { status: 200 })
  await assert.rejects(
    () => generateWithDrawThings({ prompt: 'lettuce', negativePrompt: '', width: 1024, height: 1024 }, fakeFetch),
    DrawThingsGenerationError,
  )
})
