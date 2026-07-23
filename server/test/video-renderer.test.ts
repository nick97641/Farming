import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectAudioType } from '../lib/video-renderer.ts'

test('detectAudioType recognizes WAV bytes', () => {
  const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])
  assert.deepEqual(detectAudioType(bytes), { ext: 'wav', mimeType: 'audio/wav' })
})

test('detectAudioType recognizes ID3 and frame-header MP3 bytes', () => {
  assert.deepEqual(detectAudioType(Buffer.from('ID3more bytes')), { ext: 'mp3', mimeType: 'audio/mpeg' })
  assert.deepEqual(detectAudioType(Buffer.from([0xff, 0xfb, 0x90, 0x64])), { ext: 'mp3', mimeType: 'audio/mpeg' })
})

test('detectAudioType recognizes M4A-compatible ISO media bytes', () => {
  const bytes = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('M4A ')])
  assert.deepEqual(detectAudioType(bytes), { ext: 'm4a', mimeType: 'audio/mp4' })
})

test('detectAudioType rejects arbitrary or empty bytes', () => {
  assert.equal(detectAudioType(Buffer.from('plain text')), null)
  assert.equal(detectAudioType(Buffer.alloc(0)), null)
})
