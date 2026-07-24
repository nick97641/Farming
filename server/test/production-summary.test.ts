import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getDesignBriefReadiness, getTextReadiness } from '../../src/lib/productionSummary.ts'
import type { DesignBrief } from '../../shared/schema/project.ts'

function blankDesignBrief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    sourceIdeaId: 'idea-1',
    status: 'draft',
    title: 'Title',
    audience: '',
    problem: '',
    outcome: '',
    format: '',
    contentRequirements: [],
    visualDirection: '',
    constraints: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('getTextReadiness reports Not created for empty and whitespace-only content', () => {
  assert.equal(getTextReadiness(''), 'Not created')
  assert.equal(getTextReadiness('   '), 'Not created')
  assert.equal(getTextReadiness('\n\t  '), 'Not created')
})

test('getTextReadiness reports Ready for any real, non-whitespace content', () => {
  assert.equal(getTextReadiness('A real script.'), 'Ready')
  assert.equal(getTextReadiness('  padded but real  '), 'Ready')
})

test('getDesignBriefReadiness reports Not created when there is no Design Brief', () => {
  assert.equal(getDesignBriefReadiness(null), 'Not created')
})

test('getDesignBriefReadiness reports Draft for a Design Brief still in draft status', () => {
  assert.equal(getDesignBriefReadiness(blankDesignBrief({ status: 'draft' })), 'Draft')
})

test('getDesignBriefReadiness reports Ready for a Design Brief marked ready', () => {
  assert.equal(getDesignBriefReadiness(blankDesignBrief({ status: 'ready' })), 'Ready')
})
