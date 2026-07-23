type PdfLine = {
  text: string
  font: 'regular' | 'bold'
  size: number
  spacingAfter: number
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54
const BODY_SIZE = 11
const BODY_LEADING = 15

const encoder = new TextEncoder()

function toAscii(value: string): string {
  return value
    .replaceAll('\u2018', "'")
    .replaceAll('\u2019', "'")
    .replaceAll('\u201c', '"')
    .replaceAll('\u201d', '"')
    .replaceAll('\u2013', '-')
    .replaceAll('\u2014', '-')
    .replaceAll('\u2026', '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e\n\t]/g, '?')
}

function escapePdfText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

function wrapLine(text: string, fontSize: number): string[] {
  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const maxCharacters = Math.max(18, Math.floor(usableWidth / (fontSize * 0.52)))
  const trimmed = text.trim()
  if (!trimmed) return ['']

  const words = trimmed.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharacters) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function formatDraft(draft: string, title: string): PdfLine[] {
  const lines: PdfLine[] = []
  const cleanTitle = toAscii(title.trim() || 'Farming Guide')
  for (const wrapped of wrapLine(cleanTitle, 20)) {
    lines.push({ text: wrapped, font: 'bold', size: 20, spacingAfter: 6 })
  }
  lines.push({ text: '', font: 'regular', size: BODY_SIZE, spacingAfter: 8 })

  for (const rawLine of toAscii(draft).split(/\r?\n/)) {
    const heading = rawLine.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const size = heading[1].length === 1 ? 16 : heading[1].length === 2 ? 14 : 12
      lines.push({ text: '', font: 'regular', size: BODY_SIZE, spacingAfter: 5 })
      for (const wrapped of wrapLine(heading[2], size)) {
        lines.push({ text: wrapped, font: 'bold', size, spacingAfter: 4 })
      }
      continue
    }

    if (!rawLine.trim()) {
      lines.push({ text: '', font: 'regular', size: BODY_SIZE, spacingAfter: 7 })
      continue
    }

    for (const wrapped of wrapLine(rawLine, BODY_SIZE)) {
      lines.push({ text: wrapped, font: 'regular', size: BODY_SIZE, spacingAfter: 0 })
    }
  }
  return lines
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [[]]
  let y = PAGE_HEIGHT - MARGIN

  for (const line of lines) {
    const lineHeight = Math.max(BODY_LEADING, line.size + 4) + line.spacingAfter
    if (y - lineHeight < MARGIN) {
      pages.push([])
      y = PAGE_HEIGHT - MARGIN
    }
    pages[pages.length - 1].push(line)
    y -= lineHeight
  }
  return pages
}

function pageStream(lines: PdfLine[], pageNumber: number, pageCount: number, regularFontId: number, boldFontId: number): string {
  const commands: string[] = []
  let y = PAGE_HEIGHT - MARGIN

  for (const line of lines) {
    const fontId = line.font === 'bold' ? boldFontId : regularFontId
    if (line.text) {
      commands.push(
        `BT /F${fontId} ${line.size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapePdfText(line.text)}) Tj ET`,
      )
    }
    y -= Math.max(BODY_LEADING, line.size + 4) + line.spacingAfter
  }

  const footer = `Page ${pageNumber} of ${pageCount}`
  commands.push(
    `BT /F${regularFontId} 9 Tf 0.4 g 1 0 0 1 ${MARGIN} 28 Tm (${escapePdfText(footer)}) Tj ET`,
  )
  return commands.join('\n')
}

export function buildTextPdf(input: { title: string; draft: string }): Uint8Array {
  const pages = paginate(formatDraft(input.draft, input.title))
  const regularFontId = 3 + pages.length * 2
  const boldFontId = regularFontId + 1
  const objects = new Map<number, string>()

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  const pageIds = pages.map((_, index) => 3 + index * 2)
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)

  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const streamId = pageId + 1
    const stream = pageStream(page, index + 1, pages.length, regularFontId, boldFontId)
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F${regularFontId} ${regularFontId} 0 R /F${boldFontId} ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`,
    )
    objects.set(streamId, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`)
  })

  objects.set(regularFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  objects.set(boldFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

  const objectCount = boldFontId
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = [0]
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = encoder.encode(pdf).length
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`
  }

  const xrefOffset = encoder.encode(pdf).length
  pdf += `xref\n0 ${objectCount + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= objectCount; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encoder.encode(pdf)
}

export function pdfFilename(title: string): string {
  const slug = toAscii(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'farming-guide'}.pdf`
}
