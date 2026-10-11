import { describe, expect, it } from 'vitest'
import { LOOP_AUDIO_FILE_ACCEPT, mimeTypeForLoopFileName } from './loopAudioFormats'

describe('loop audio formats', () => {
  it('does not use a catch-all audio filter that would open Photos on iOS', () => {
    expect(LOOP_AUDIO_FILE_ACCEPT).not.toMatch(/(^|,)audio\/\*(,|$)/)
    expect(LOOP_AUDIO_FILE_ACCEPT).toContain('.mp3')
    expect(LOOP_AUDIO_FILE_ACCEPT).toContain('.flac')
    expect(LOOP_AUDIO_FILE_ACCEPT).toContain('.m4a')
    expect(LOOP_AUDIO_FILE_ACCEPT).toContain('.wav')
  })

  it('picks a mime type from the file name', () => {
    expect(mimeTypeForLoopFileName('groove.MP3')).toBe('audio/mpeg')
    expect(mimeTypeForLoopFileName('pad.m4a')).toBe('audio/mp4')
    expect(mimeTypeForLoopFileName('drone.flac')).toBe('audio/flac')
    expect(mimeTypeForLoopFileName('click.wav')).toBe('audio/wav')
  })
})
