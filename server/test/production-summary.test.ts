import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getDesignBriefReadiness, getTextReadiness, hasPublicationInfo, isSafeWebUrl } from '../../src/lib/productionSummary.ts'
import { createDefaultIdeaPublicationInfo, type DesignBrief, type IdeaPublicationInfo } from '../../shared/schema/project.ts'

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

function publication(overrides: Partial<IdeaPublicationInfo> = {}): IdeaPublicationInfo {
  return { ...createDefaultIdeaPublicationInfo(), ...overrides }
}

test('hasPublicationInfo is false for the all-empty default', () => {
  assert.equal(hasPublicationInfo(createDefaultIdeaPublicationInfo()), false)
})

test('hasPublicationInfo is false when every field is whitespace-only', () => {
  assert.equal(hasPublicationInfo(publication({ url: '  ', publishedAt: '\t', platform: '\n', notes: '   ' })), false)
})

test('hasPublicationInfo is true when only url is populated', () => {
  assert.equal(hasPublicationInfo(publication({ url: 'https://example.com' })), true)
})

test('hasPublicationInfo is true when only publishedAt is populated', () => {
  assert.equal(hasPublicationInfo(publication({ publishedAt: '2024-03-15' })), true)
})

test('hasPublicationInfo is true when only platform is populated', () => {
  assert.equal(hasPublicationInfo(publication({ platform: 'YouTube' })), true)
})

test('hasPublicationInfo is true when only notes is populated', () => {
  assert.equal(hasPublicationInfo(publication({ notes: 'Went live in March.' })), true)
})

test('isSafeWebUrl accepts http and https URLs', () => {
  assert.equal(isSafeWebUrl('https://www.youtube.com/watch?v=abc123'), true)
  assert.equal(isSafeWebUrl('http://example.com'), true)
})

test('isSafeWebUrl rejects a javascript: URL', () => {
  assert.equal(isSafeWebUrl('javascript:alert(1)'), false)
})

test('isSafeWebUrl rejects a data: URL', () => {
  assert.equal(isSafeWebUrl('data:text/html,<script>alert(1)</script>'), false)
})

test('isSafeWebUrl rejects a mailto: URL', () => {
  assert.equal(isSafeWebUrl('mailto:someone@example.com'), false)
})

test('isSafeWebUrl rejects a malformed, unparseable string', () => {
  assert.equal(isSafeWebUrl('not a url at all'), false)
})

test('isSafeWebUrl rejects an empty string', () => {
  assert.equal(isSafeWebUrl(''), false)
})
