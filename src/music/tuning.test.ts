import { describe, expect, it } from 'vitest'
import { NOTE_IDS, TONAL_CENTERS, type NoteId } from './notes'
import {
  TUNING_SYSTEMS,
  findHighestEnabledToneNoteId,
  findLowestEnabledToneNoteId,
  getFrequency,
  midiFromNoteId,
  resolveTonalCenterNoteId,
  transposeNoteClass,
} from './tuning'

const A4 = 440

describe('equal temperament', () => {
  it('places a at the A4 reference when base octave is 4', () => {
    expect(midiFromNoteId('a', 4)).toBe(69)
    expect(getFrequency('a', 'equal', 'd', A4, 4)).toBeCloseTo(440, 6)
  })

  it('follows the reference pitch', () => {
    expect(getFrequency('a', 'equal', 'd', 442, 4)).toBeCloseTo(442, 6)
  })

  it('maps octave suffixes to whole octaves', () => {
    expect(getFrequency('a1', 'equal', 'd', A4, 4)).toBeCloseTo(880, 6)
    expect(getFrequency('a0', 'equal', 'd', A4, 4)).toBeCloseTo(220, 6)
    expect(getFrequency('a', 'equal', 'd', A4, 3)).toBeCloseTo(220, 6)
  })

  it('clamps base octave to the supported range', () => {
    expect(midiFromNoteId('c', 0)).toBe(midiFromNoteId('c', 1))
    expect(midiFromNoteId('c', 9)).toBe(midiFromNoteId('c', 5))
  })
})

describe('pure intervals over the tonal center', () => {
  it('natural tuning gives a pure fifth and pure major third', () => {
    const d = getFrequency('d', 'just', 'd', A4, 3)
    expect(getFrequency('a', 'just', 'd', A4, 3) / d).toBeCloseTo(3 / 2, 9)
    expect(getFrequency('fis', 'just', 'd', A4, 3) / d).toBeCloseTo(5 / 4, 9)
  })

  it('pythagorean tuning gives a pure fifth and a pythagorean third', () => {
    const d = getFrequency('d', 'pythagorean', 'd', A4, 3)
    expect(getFrequency('a', 'pythagorean', 'd', A4, 3) / d).toBeCloseTo(3 / 2, 9)
    expect(getFrequency('fis', 'pythagorean', 'd', A4, 3) / d).toBeCloseTo(81 / 64, 9)
  })

  it('keeps the tonal center itself at its equal-tempered pitch', () => {
    for (const center of TONAL_CENTERS) {
      const centerNote = resolveTonalCenterNoteId(center, 3)
      const equal = getFrequency(centerNote, 'equal', center, A4, 3)
      for (const system of TUNING_SYSTEMS) {
        expect(getFrequency(centerNote, system.id, center, A4, 3)).toBeCloseTo(equal, 6)
      }
    }
  })
})

describe('every tuning system', () => {
  it('returns a finite positive frequency for every note, center and octave', () => {
    for (const system of TUNING_SYSTEMS) {
      for (const center of TONAL_CENTERS) {
        for (let octave = 1; octave <= 5; octave += 1) {
          for (const noteId of NOTE_IDS) {
            const hz = getFrequency(noteId, system.id, center, A4, octave)
            expect(Number.isFinite(hz) && hz > 0, `${system.id} ${center} ${octave} ${noteId}`).toBe(true)
          }
        }
      }
    }
  })

  it('keeps notes in ascending pitch order (12-tone systems)', () => {
    const twelveTone = TUNING_SYSTEMS.filter((system) => system.id !== 'bohlen-pierce')
    for (const system of twelveTone) {
      for (const center of TONAL_CENTERS) {
        const frequencies = NOTE_IDS.map((noteId) => getFrequency(noteId, system.id, center, A4, 3))
        for (let index = 1; index < frequencies.length; index += 1) {
          expect(frequencies[index], `${system.id} ${center} ${NOTE_IDS[index]}`).toBeGreaterThan(
            frequencies[index - 1],
          )
        }
      }
    }
  })
})

describe('lowest / highest enabled tone', () => {
  const tones: { noteId: NoteId; enabled: boolean }[] = [
    { noteId: 'g0', enabled: false },
    { noteId: 'd', enabled: true },
    { noteId: 'a', enabled: true },
    { noteId: 'd2', enabled: false },
  ]

  it('ignores disabled tones', () => {
    expect(findLowestEnabledToneNoteId(tones, 'equal', 'd', A4, 3)).toBe('d')
    expect(findHighestEnabledToneNoteId(tones, 'equal', 'd', A4, 3)).toBe('a')
  })

  it('returns null when nothing is enabled', () => {
    expect(findLowestEnabledToneNoteId([], 'equal', 'd', A4, 3)).toBeNull()
  })
})

it('transposeNoteClass wraps around the octave', () => {
  expect(transposeNoteClass('h', 1)).toBe('c')
  expect(transposeNoteClass('c', -1)).toBe('h')
  expect(transposeNoteClass('d', 7)).toBe('a')
})
