import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createProject, readProject, writeProject } from '../lib/storage.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-storage-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

test('atomic write persists content and leaves no temp file behind', async () => {
  const project = await createProject({ id: 'atomic-write-test', title: 'Atomic Test', topic: 'hydroponics' })
  const updated = await writeProject({ ...project, title: 'Renamed Title' })

  const reloaded = await readProject('atomic-write-test')
  assert.equal(reloaded.title, 'Renamed Title')
  assert.equal(updated.title, 'Renamed Title')

  const projectDir = path.join(dataDir, 'projects', 'atomic-write-test')
  const entries = await readdir(projectDir)
  const leftoverTempFiles = entries.filter((name) => name.startsWith('.project.json.tmp-'))
  assert.deepEqual(leftoverTempFiles, [])
})

test('a rejected write does not corrupt the previously saved project', async () => {
  const project = await createProject({ id: 'rejected-write-test', title: 'Original Title', topic: 'aquaponics' })

  const invalidProject = { ...project, title: 123 } as unknown as typeof project
  await assert.rejects(() => writeProject(invalidProject))

  const reloaded = await readProject('rejected-write-test')
  assert.equal(reloaded.title, 'Original Title')
})

test('concurrent writes to the same project resolve without corrupting the file', async () => {
  const project = await createProject({ id: 'concurrent-write-test', title: 'Start', topic: 'microgreens' })

  const [resultA, resultB] = await Promise.all([
    writeProject({ ...project, title: 'Writer A' }),
    writeProject({ ...project, title: 'Writer B' }),
  ])

  const reloaded = await readProject('concurrent-write-test')
  assert.ok(['Writer A', 'Writer B'].includes(reloaded.title))
  assert.ok([resultA.title, resultB.title].includes(reloaded.title))
})
