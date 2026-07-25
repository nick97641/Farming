import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createEmptyProject } from '../../shared/schema/project.ts'
import {
  buildProductTemplate,
  buildProductionSummary,
  safeArtifactBaseName,
} from '../../src/lib/projectArtifacts.ts'

test('safeArtifactBaseName creates a stable local filename', () => {
  assert.equal(safeArtifactBaseName('  DWC Lettuce: Week 1  '), 'dwc-lettuce-week-1')
  assert.equal(safeArtifactBaseName('***'), 'farming-project')
})

test('project artifact builders include the project identity and readiness', () => {
  const project = createEmptyProject({ id: 'artifact-test', title: 'Basil Guide', topic: 'indoor basil' })
  project.content.longFormScript = 'Script text'
  project.products.productDescription = 'A beginner basil guide.'

  const template = buildProductTemplate(project)
  const summary = buildProductionSummary(project)

  assert.match(template, /Basil Guide — Product Template/)
  assert.match(template, /A beginner basil guide\./)
  assert.match(summary, /Basil Guide — Production Summary/)
  assert.match(summary, /YouTube script: ready/)
  assert.match(summary, /PDF draft: not created/)
})
