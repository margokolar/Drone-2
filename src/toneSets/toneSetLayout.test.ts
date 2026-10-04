import { describe, expect, it } from 'vitest'
import { buildDefaultToneSetLayout, parseToneIdList, parseToneSetLayout } from './toneSetLayout'

describe('parseToneIdList', () => {
  it('accepts note ids and resolves sharps/flats to the app note names', () => {
    expect(parseToneIdList(['d', 'F#', 'bb', 'c#1']).ids).toEqual(['d', 'fis', 'b', 'cis1'])
  })

  it('remembers how accidentals were written so labels can show them', () => {
    expect(parseToneIdList(['eb', 'f#']).labelOverrides).toEqual({ dis: 'e♭', fis: 'f♯' })
  })

  it('drops unknown entries and non-strings', () => {
    expect(parseToneIdList(['x', 3, null, 'g']).ids).toEqual(['g'])
    expect(parseToneIdList('d').ids).toEqual([])
  })
})

describe('parseToneSetLayout', () => {
  it('round-trips the default layout', () => {
    const layout = buildDefaultToneSetLayout()
    expect(parseToneSetLayout(layout)).toMatchObject({
      name: layout.name,
      subOctaveIds: layout.subOctaveIds,
      gridIds: layout.gridIds,
    })
  })

  it('rejects duplicates and empty grids', () => {
    expect(parseToneSetLayout({ name: 'Dup', subOctaveIds: [], gridIds: ['d', 'd'] })).toBeNull()
    expect(parseToneSetLayout({ name: 'Empty', subOctaveIds: ['g0'], gridIds: [] })).toBeNull()
    expect(parseToneSetLayout(null)).toBeNull()
  })

  it('names unnamed sets "Custom"', () => {
    expect(parseToneSetLayout({ subOctaveIds: [], gridIds: ['d', 'a'] })?.name).toBe('Custom')
  })
})
