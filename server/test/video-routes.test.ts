import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import express from 'express'

import { videoRouter } from '../routes/video.ts'
import { getGeneratedImagesDir, getProjectDir } from '../lib/paths.ts'
import { createProject, readProject, writeProject } from '../lib/storage.ts'
import { resolveAssetFileForServing } from '../lib/video-renderer.ts'
import { createDefaultStructuredRequirements, ENRICHMENT_POLICY_VERSION } from '../../shared/imageEnrichment.ts'
import { DEFAULT_MODEL_PROFILE_ID } from '../../shared/modelProfiles.ts'
import { createDefaultAdvancedSettings, type ImageJob, type Project } from '../../shared/schema/project.ts'

let dataDir: string
let toolsDir: string
let server: Server
let baseUrl: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-video-routes-test-'))
  toolsDir = await mkdtemp(path.join(tmpdir(), 'farming-video-tools-test-'))
  process.env.FARMING_DATA_DIR = dataDir

  const fakeProbe = path.join(toolsDir, 'ffprobe')
  const fakeFfmpeg = path.join(toolsDir, 'ffmpeg')
  await writeFile(fakeProbe, '#!/usr/bin/env node\nprocess.stdout.write("2.5\\n")\n', 'utf8')
  await writeFile(
    fakeFfmpeg,
    '#!/usr/bin/env node\nsetTimeout(() => require("node:fs").writeFileSync(process.argv.at(-1), Buffer.from("FAKE_MP4")), 200)\n',
    'utf8',
  )
  await chmod(fakeProbe, 0o755)
  await chmod(fakeFfmpeg, 0o755)
  process.env.FFPROBE_PATH = fakeProbe
  process.env.FFMPEG_PATH = fakeFfmpeg

  const app = express()
  app.use('/api', videoRouter)
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  delete process.env.FARMING_DATA_DIR
  delete process.env.FFPROBE_PATH
  delete process.env.FFMPEG_PATH
  await rm(dataDir, { recursive: true, force: true })
  await rm(toolsDir, { recursive: true, force: true })
})

async function createVideoReadyProject(options: { withScript?: boolean } = {}): Promise<{ project: Project; job: ImageJob }> {
  const now = new Date().toISOString()
  const project = await createProject({ id: randomUUID(), title: 'Basil Starter Video', topic: 'hydroponics' })
  const imageDir = getGeneratedImagesDir(project.id)
  await mkdir(imageDir, { recursive: true })
  const imageName = `${randomUUID()}.png`
  const imagePath = path.join(imageDir, imageName)
  await writeFile(imagePath, Buffer.from('test image bytes'))

  const job: ImageJob = {
    id: randomUUID(),
    sourceDesignBriefUpdatedAt: null,
    purpose: 'custom',
    label: 'Basil roots',
    status: 'completed',
    prompt: 'healthy basil roots',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    sourceType: 'generated',
    output: {
      fileName: imageName,
      relativePath: path.relative(getProjectDir(project.id), imagePath),
      generatedAt: now,
    },
    originalFilename: null,
    policyVersion: ENRICHMENT_POLICY_VERSION,
    userDescription: 'healthy basil roots',
    structuredRequirements: createDefaultStructuredRequirements(),
    enrichmentRecipe: null,
    destination: null,
    references: [],
    modelProfileId: DEFAULT_MODEL_PROFILE_ID,
    advancedSettings: createDefaultAdvancedSettings(),
    controls: [],
    effectiveModel: null,
    variationGroupId: null,
    createdAt: now,
    updatedAt: now,
  }
  const updated = await writeProject({
    ...project,
    imageJobs: [job],
    content: { ...project.content, longFormScript: options.withScript === false ? '' : 'A saved YouTube script.' },
  })
  return { project: updated, job }
}

const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WAVEfmt ', 'ascii'),
  Buffer.alloc(32),
])

test('video render requires a saved YouTube script', async () => {
  const { project, job } = await createVideoReadyProject({ withScript: false })
  const res = await fetch(`${baseUrl}/projects/${project.id}/video/render?imageJobIds=${job.id}&filename=voice.wav`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: WAV_BYTES,
  })
  assert.equal(res.status, 400)
})

test('video render rejects audio whose bytes are not WAV, MP3, or M4A', async () => {
  const { project, job } = await createVideoReadyProject()
  const res = await fetch(`${baseUrl}/projects/${project.id}/video/render?imageJobIds=${job.id}&filename=fake.wav`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: Buffer.from('not audio'),
  })
  assert.equal(res.status, 400)
})

test('video render stores narration and MP4 assets, then serves the MP4', async () => {
  const { project, job } = await createVideoReadyProject()
  const res = await fetch(`${baseUrl}/projects/${project.id}/video/render?imageJobIds=${job.id}&filename=my-voice.wav`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: WAV_BYTES,
  })
  assert.equal(res.status, 201)
  const body = (await res.json()) as { project: Project; videoAssetId: string }
  assert.equal(body.project.assets.length, 2)
  assert.equal(body.project.assets[0].type, 'audio')
  assert.equal(body.project.assets[0].fileName, 'my-voice.wav')
  assert.equal(body.project.assets[1].type, 'video')
  assert.equal(body.project.assets[1].fileName, 'basil-starter-video.mp4')

  const reloaded = await readProject(project.id)
  assert.deepEqual(reloaded.assets, body.project.assets)

  const resolvedVideo = await resolveAssetFileForServing(project.id, body.project.assets[1].relativePath)
  assert.ok(resolvedVideo)
  const download = await fetch(`${baseUrl}/projects/${project.id}/assets/${body.videoAssetId}/file`)
  assert.equal(download.status, 200)
  assert.equal(Buffer.from(await download.arrayBuffer()).toString(), 'FAKE_MP4')

  const videoPath = path.join(getProjectDir(project.id), body.project.assets[1].relativePath)
  assert.equal((await readFile(videoPath)).toString(), 'FAKE_MP4')
})

test('video render preserves project edits saved while FFmpeg is running', async () => {
  const { project, job } = await createVideoReadyProject()
  const renderPromise = fetch(
    `${baseUrl}/projects/${project.id}/video/render?imageJobIds=${job.id}&filename=narration.wav`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: WAV_BYTES,
    },
  )

  await new Promise((resolve) => setTimeout(resolve, 120))
  const duringRender = await readProject(project.id)
  await writeProject({ ...duringRender, topic: 'saved while rendering' })

  const res = await renderPromise
  assert.equal(res.status, 201)
  const body = (await res.json()) as { project: Project }
  assert.equal(body.project.topic, 'saved while rendering')
  assert.equal(body.project.assets.filter((asset) => asset.type === 'video').length, 1)
})
