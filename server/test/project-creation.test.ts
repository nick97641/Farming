import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createProject, readProject, ProjectAlreadyExistsError } from '../lib/storage.ts'
import { ProjectSchema } from '../../shared/schema/project.ts'
import { getAllAssetDirs, getExportsDir } from '../lib/paths.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-project-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

test('creating a project produces a schema-valid project.json', async () => {
  const project = await createProject({ id: 'proj-1', title: 'DWC Lettuce', topic: 'deep water culture lettuce' })
  const result = ProjectSchema.safeParse(project)
  assert.ok(result.success)
  assert.equal(project.status, 'draft')
  assert.deepEqual(project.ideas, [])
})

test('creating a project creates all asset subfolders and the exports folder', async () => {
  await createProject({ id: 'proj-2', title: 'NFT Channel Setup', topic: 'nutrient film technique' })

  for (const dir of getAllAssetDirs('proj-2')) {
    await assert.doesNotReject(() => access(dir))
  }
  await assert.doesNotReject(() => access(getExportsDir('proj-2')))
})

test('creating a project with a duplicate id is rejected', async () => {
  await createProject({ id: 'proj-3', title: 'Aquaponics Intro', topic: 'aquaponics' })
  await assert.rejects(
    () => createProject({ id: 'proj-3', title: 'Another', topic: 'other' }),
    ProjectAlreadyExistsError,
  )
})

test('reading back a created project round-trips through the schema', async () => {
  const created = await createProject({ id: 'proj-4', title: 'Vertical Tower', topic: 'vertical hydroponics' })
  const reloaded = await readProject('proj-4')
  assert.deepEqual(reloaded, created)
})
