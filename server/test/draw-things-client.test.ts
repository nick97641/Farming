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
