import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTextPdf, pdfFilename } from '../lib/pdfExport.ts'

const decoder = new TextDecoder('latin1')

test('buildTextPdf creates a complete PDF document containing the draft text', () => {
  const bytes = buildTextPdf({
    title: 'Countertop Basil Guide',
    draft: '## Materials\n\n- Container\n- Basil plant\n\nKeep the process simple.',
  })
  const pdf = decoder.decode(bytes)

  assert.ok(pdf.startsWith('%PDF-1.4'))
  assert.ok(pdf.includes('(Countertop Basil Guide) Tj'))
  assert.ok(pdf.includes('(Materials) Tj'))
  assert.ok(pdf.includes('(Keep the process simple.) Tj'))
  assert.ok(pdf.endsWith('%%EOF\n'))
})

test('buildTextPdf paginates long drafts and adds page numbers', () => {
  const draft = Array.from({ length: 160 }, (_, index) => `Step ${index + 1}: Check the plant and water level.`).join('\n')
  const pdf = decoder.decode(buildTextPdf({ title: 'Long Guide', draft }))
  const countMatch = pdf.match(/\/Type \/Pages .*\/Count (\d+)/)

  assert.ok(countMatch)
  assert.ok(Number(countMatch[1]) > 1)
  assert.ok(pdf.includes('(Page 1 of '))
})

test('buildTextPdf converts common Unicode punctuation to readable PDF-safe text', () => {
  const pdf = decoder.decode(buildTextPdf({ title: 'Grower\u2019s Guide', draft: '\u201cSimple\u201d \u2014 not complicated\u2026' }))

  assert.ok(pdf.includes("(Grower's Guide) Tj"))
  assert.ok(pdf.includes('("Simple" - not complicated...) Tj'))
})

test('pdfFilename creates a stable local filename', () => {
  assert.equal(pdfFilename('Countertop Basil: A Beginner\u2019s Guide'), 'countertop-basil-a-beginner-s-guide.pdf')
  assert.equal(pdfFilename('   '), 'farming-guide.pdf')
})
