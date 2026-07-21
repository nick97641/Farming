// Dependency-free dimension readers for the three formats this app accepts.
// Returns null rather than a guess when a format's dimensions can't be
// reliably determined (e.g. an unrecognized WEBP variant) — never invents a
// width/height that wasn't actually read from the file.

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  // IHDR is always the first chunk, immediately after the 8-byte signature +
  // 4-byte length + 4-byte "IHDR" tag: width then height, each big-endian u32.
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2 // skip the SOI marker (0xFFD8)
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null
    const marker = buffer[offset + 1]
    // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 all carry the dimensions
    // at the same offset within their segment; SOF markers are 0xC0-0xCF
    // excluding the DHT/JPG/DAC markers at 0xC4, 0xC8, 0xCC.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      if (width <= 0 || height <= 0) return null
      return { width, height }
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) return null
    offset += 2 + segmentLength
  }
  return null
}

export function readImageDimensions(buffer: Buffer, ext: string): { width: number; height: number } | null {
  if (ext === 'png') return readPngDimensions(buffer)
  if (ext === 'jpg' || ext === 'jpeg') return readJpegDimensions(buffer)
  // WEBP dimension parsing (VP8/VP8L/VP8X) is not implemented — returning
  // null here is honest about the limitation rather than guessing.
  return null
}
