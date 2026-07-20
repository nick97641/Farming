import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createProject, deleteProject, listProjects, ProjectNotFoundError } from '../lib/storage.ts'
import { getProjectDir } from '../lib/paths.ts'

let dataDir: string

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'farming-project-mgmt-test-'))
  process.env.FARMING_DATA_DIR = dataDir
})

after(async () => {
  delete process.env.FARMING_DATA_DIR
  await rm(dataDir, { recursive: true, force: true })
})

test('listProjects returns an empty array when no projects exist yet', async () => {
  const projects = await listProjects()
  assert.deepEqual(projects, [])
})

test('listProjects returns every created project', async () => {
  await createProject({ id: 'list-1', title: 'Kratky Basil', topic: 'kratky method basil' })
  await createProject({ id: 'list-2', title: 'Ebb and Flow', topic: 'ebb and flow tomatoes' })

  const projects = await listProjects()
  const ids = projects.map((project) => project.id).sort()
  assert.deepEqual(ids, ['list-1', 'list-2'])
})

test('deleteProject removes the project directory and it no longer appears in listProjects', async () => {
  await createProject({ id: 'delete-me', title: 'Temporary', topic: 'temporary topic' })
  await deleteProject('delete-me')

  await assert.rejects(() => access(getProjectDir('delete-me')))

  const projects = await listProjects()
  assert.ok(!projects.some((project) => project.id === 'delete-me'))
})

test('deleteProject on a non-existent project throws ProjectNotFoundError', async () => {
  await assert.rejects(() => deleteProject('does-not-exist'), ProjectNotFoundError)
})
