import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Asset } from '../../shared/schema/project.ts'
import { assertPathWithinDir, getAssetDir, getProjectDir } from './paths.ts'

const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const MAX_TOOL_OUTPUT_CHARS = 12_000

export class VideoRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VideoRenderError'
  }
}

type AudioType = { ext: 'wav' | 'mp3' | 'm4a'; mimeType: string }

export function detectAudioType(buffer: Buffer): AudioType | null {
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return { ext: 'wav', mimeType: 'audio/wav' }
  }
  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') {
    return { ext: 'mp3', mimeType: 'audio/mpeg' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { ext: 'mp3', mimeType: 'audio/mpeg' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { ext: 'm4a', mimeType: 'audio/mp4' }
  }
  return null
}

function cleanDisplayName(fileName: string, fallback: string): string {
  const baseName = Array.from(path.basename(fileName))
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .trim()
  return baseName || fallback
}

function slug(value: string): string {
  return (
    Array.from(value.normalize('NFKD'))
      .filter((character) => character.charCodeAt(0) <= 127)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'farming-video'
  )
}

function runTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_TOOL_OUTPUT_CHARS) stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_TOOL_OUTPUT_CHARS) stderr += chunk.toString()
    })
    child.once('error', (error) => reject(new VideoRenderError(`Could not start ${command}: ${error.message}`)))
    child.once('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new VideoRenderError(`${path.basename(command)} failed: ${stderr.trim() || `exit code ${code}`}`))
    })
  })
}

export async function saveNarration(input: {
  projectId: string
  originalFileName: string
  buffer: Buffer
}): Promise<{ asset: Asset; absolutePath: string; mimeType: string }> {
  const { projectId, originalFileName, buffer } = input
  if (buffer.length === 0) throw new VideoRenderError('Narration file is empty')
  if (buffer.length > MAX_AUDIO_BYTES) throw new VideoRenderError('Narration file exceeds the 100MB limit')

  const detected = detectAudioType(buffer)
  if (!detected) throw new VideoRenderError('Narration must be a WAV, MP3, or M4A audio file')

  const dir = getAssetDir(projectId, 'audio')
  await mkdir(dir, { recursive: true })
  const storedName = `${randomUUID()}.${detected.ext}`
  const absolutePath = assertPathWithinDir(dir, path.join(dir, storedName))
  const tempPath = assertPathWithinDir(dir, path.join(dir, `.tmp-${randomBytes(6).toString('hex')}`))
  await writeFile(tempPath, buffer)
  try {
    await rename(tempPath, absolutePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  const now = new Date().toISOString()
  return {
    absolutePath,
    mimeType: detected.mimeType,
    asset: {
      id: randomUUID(),
      fileName: cleanDisplayName(originalFileName, `narration.${detected.ext}`),
      relativePath: path.relative(getProjectDir(projectId), absolutePath),
      type: 'audio',
      source: 'User narration upload',
      licenseNotes: '',
      usageNotes: 'Narration used for a local YouTube video render.',
      addedAt: now,
    },
  }
}

function concatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''")
}

export async function renderSlideshowVideo(input: {
  projectId: string
  projectTitle: string
  imagePaths: string[]
  audioPath: string
}): Promise<{ asset: Asset; absolutePath: string }> {
  const { projectId, projectTitle, imagePaths, audioPath } = input
  if (imagePaths.length === 0) throw new VideoRenderError('Select at least one image')

  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
  const durationOutput = await runTool(ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ])
  const duration = Number(durationOutput.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new VideoRenderError('Could not determine a positive duration for the narration')
  }

  const videoDir = getAssetDir(projectId, 'video')
  await mkdir(videoDir, { recursive: true })
  const token = randomBytes(6).toString('hex')
  const listPath = assertPathWithinDir(videoDir, path.join(videoDir, `.render-${token}.txt`))
  const tempVideoPath = assertPathWithinDir(videoDir, path.join(videoDir, `.render-${token}.mp4`))
  const storedName = `${randomUUID()}.mp4`
  const absolutePath = assertPathWithinDir(videoDir, path.join(videoDir, storedName))
  const secondsPerImage = duration / imagePaths.length
  const concatLines = imagePaths.flatMap((imagePath) => [
    `file '${concatPath(imagePath)}'`,
    `duration ${secondsPerImage.toFixed(6)}`,
  ])
  concatLines.push(`file '${concatPath(imagePaths[imagePaths.length - 1])}'`)
  await writeFile(listPath, `${concatLines.join('\n')}\n`, 'utf8')

  try {
    await runTool(ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-i',
      audioPath,
      '-vf',
      'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      tempVideoPath,
    ])
    await rename(tempVideoPath, absolutePath)
  } catch (error) {
    await unlink(tempVideoPath).catch(() => undefined)
    throw error
  } finally {
    await unlink(listPath).catch(() => undefined)
  }

  return {
    absolutePath,
    asset: {
      id: randomUUID(),
      fileName: `${slug(projectTitle)}.mp4`,
      relativePath: path.relative(getProjectDir(projectId), absolutePath),
      type: 'video',
      source: 'Local FFmpeg render',
      licenseNotes: '',
      usageNotes: `Rendered from ${imagePaths.length} selected project image${imagePaths.length === 1 ? '' : 's'} and user narration.`,
      addedAt: new Date().toISOString(),
    },
  }
}

export async function resolveAssetFileForServing(projectId: string, relativePath: string): Promise<string | null> {
  const projectDir = getProjectDir(projectId)
  const candidate = assertPathWithinDir(projectDir, path.join(projectDir, relativePath))
  const stat = await lstat(candidate).catch(() => null)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return null
  const real = await realpath(candidate)
  // Resolve the base too: macOS aliases /var to /private/var, and comparing
  // one canonical path with one lexical path would incorrectly reject a
  // legitimate project file stored under the system temporary directory.
  const realProjectDir = await realpath(projectDir).catch(() => projectDir)
  return assertPathWithinDir(realProjectDir, real)
}

export async function deleteRenderedFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined)
}
