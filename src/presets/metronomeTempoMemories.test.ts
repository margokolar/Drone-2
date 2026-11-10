import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRONOME_TEMPO_MEMORIES,
  MAX_METRONOME_BPM,
  normalizeMetronomeTempoMemories,
} from './defaultPresets'

describe('click tempo memory slots', () => {
  it('starts as 40–190 in steps of 10', () => {
    expect(normalizeMetronomeTempoMemories(undefined)).toEqual([...DEFAULT_METRONOME_TEMPO_MEMORIES])
  })

  it('keeps a full saved row of 16', () => {
    const saved: Array<number | null> = [...DEFAULT_METRONOME_TEMPO_MEMORIES]
    saved[0] = 72
    saved[15] = null
    expect(normalizeMetronomeTempoMemories(saved)).toEqual(saved)
    expect(normalizeMetronomeTempoMemories(saved)).toEqual(normalizeMetronomeTempoMemories(saved))
  })

  it('treats an older 4-slot save as the bottom row', () => {
    expect(normalizeMetronomeTempoMemories([88, 9999])).toEqual([
      40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 88, MAX_METRONOME_BPM, 180, 190,
    ])
  })
})
