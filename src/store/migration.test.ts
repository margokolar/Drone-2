import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESETS, MAX_METRONOME_BPM, type Preset } from '../presets/defaultPresets'
import { DRONE_STORE_PERSIST_VERSION, migratePersistedDroneState } from './useDroneStore'

type Migrated = Record<string, unknown> & {
  presets: Preset[]
  activePresetId: string
  activeNavigationKey: string
  presetNavigation: { kind: string }[]
  songName: string
  songLibrary: { id: string; name: string; presets: Preset[]; activePresetId: string }[]
}

const CURRENT = DRONE_STORE_PERSIST_VERSION

function migrate(state: unknown, version: number): Migrated {
  return migratePersistedDroneState(structuredClone(state), version) as Migrated
}

function userPreset(id: string, name: string): Preset {
  return { ...structuredClone(DEFAULT_PRESETS[0]), id, name }
}

const savedByUser = {
  presets: [userPreset('mine-1', 'Kyrie'), userPreset('mine-2', 'Gloria')],
  activePresetId: 'mine-2',
  songName: 'Missa',
  songLibrary: [
    {
      id: 'song-missa',
      name: 'Missa',
      presets: [userPreset('mine-1', 'Kyrie'), userPreset('mine-2', 'Gloria')],
      activePresetId: 'mine-2',
    },
    {
      id: 'song-other',
      name: 'Other',
      enabled: false,
      presets: [userPreset('o-1', 'Intro'), userPreset('o-2', 'Outro')],
      activePresetId: 'o-1',
    },
  ],
  tuningSystemId: 'just',
  tonalCenter: 'g',
  referenceA4Hz: 442,
  baseOctave: 2,
  metronomeBpm: 96,
  metronomeEnabled: true,
  entryGlideEnabled: true,
  entryGlideLowestCents: -20,
  entryGlideHighestCents: 15,
  entryGlideLowestSeconds: 1.5,
}

describe('saved data survives an app update', () => {
  it('keeps presets, songs and their names', () => {
    const result = migrate(savedByUser, CURRENT - 1)
    expect(result.presets.map((p) => p.name)).toEqual(['Kyrie', 'Gloria'])
    expect(result.activePresetId).toBe('mine-2')
    expect(result.songName).toBe('Missa')
    expect(result.songLibrary.map((s) => s.name)).toEqual(['Missa', 'Other'])
    expect(result.songLibrary[1].presets.map((p) => p.name)).toEqual(['Intro', 'Outro'])
    expect(result.songLibrary[1]).toMatchObject({ enabled: false })
  })

  it('keeps tuning, tempo and entry glide settings', () => {
    const result = migrate(savedByUser, CURRENT - 1)
    expect(result).toMatchObject({
      tuningSystemId: 'just',
      tonalCenter: 'g',
      referenceA4Hz: 442,
      baseOctave: 2,
      metronomeBpm: 96,
      metronomeEnabled: true,
      entryGlideLowestCents: -20,
      entryGlideHighestCents: 15,
      entryGlideLowestSeconds: 1.5,
    })
  })

  it('gives the same result no matter how many updates in a row happen', () => {
    const once = migrate(savedByUser, CURRENT - 1)
    const twice = migrate(once, CURRENT - 1)
    const thrice = migrate(twice, CURRENT - 1)
    expect(twice).toEqual(once)
    expect(thrice).toEqual(once)
  })

  it('flips entry glide direction only for saves older than the polarity swap', () => {
    expect(migrate(savedByUser, 12)).toMatchObject({
      entryGlideLowestCents: 20,
      entryGlideHighestCents: -15,
    })
    expect(migrate(savedByUser, 13)).toMatchObject({
      entryGlideLowestCents: -20,
      entryGlideHighestCents: 15,
    })
  })

  it('does not keep the loop running across restarts', () => {
    expect(migrate({ ...savedByUser, loopEnabled: true }, CURRENT - 1).loopEnabled).toBe(false)
  })
})

describe('damaged or very old saves', () => {
  it('fills in a usable setup from an almost empty save', () => {
    const result = migrate({}, 0)
    expect(result.presets.length).toBeGreaterThan(0)
    expect(result.presets.some((p) => p.id === result.activePresetId)).toBe(true)
    expect(result.songLibrary).toHaveLength(1)
    expect(result.songLibrary[0].presets.length).toBe(result.presets.length)
    expect(result.presetNavigation.length).toBe(result.presets.length)
  })

  it('pulls out-of-range numbers back into range', () => {
    const result = migrate(
      { ...savedByUser, metronomeBpm: 100000, baseOctave: 99, entryGlideLowestCents: -500 },
      CURRENT - 1,
    )
    expect(result.metronomeBpm).toBe(MAX_METRONOME_BPM)
    expect(result.baseOctave).toBe(5)
    expect(result.entryGlideLowestCents).toBe(-50)
  })

  it('falls back to the first preset when the active one no longer exists', () => {
    const result = migrate({ ...savedByUser, activePresetId: 'deleted' }, CURRENT - 1)
    expect(result.activePresetId).toBe('mine-1')
    expect(result.activeNavigationKey).toBe('mine-1')
  })

  it('never throws on garbage', () => {
    expect(() => migratePersistedDroneState(undefined, 0)).not.toThrow()
    expect(() => migratePersistedDroneState({ presets: 'nope' }, 0)).not.toThrow()
    expect(() => migratePersistedDroneState({ presets: [null] }, 0)).not.toThrow()
  })
})
