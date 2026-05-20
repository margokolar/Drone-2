import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PartialConfig, ToneConfig } from '../audio/types'
import { TONAL_CENTERS, migrateLegacyNoteId, NOTE_IDS, type NoteId, type TonalCenter } from '../music/notes'
import {
  MAX_BASE_OCTAVE,
  MIN_BASE_OCTAVE,
  TUNING_SYSTEMS,
  type TuningSystemId,
} from '../music/tuning'
import { createDefaultPartials, DEFAULT_PRESETS, type Preset } from '../presets/defaultPresets'

type SongEntry = {
  id: string
  name: string
  presets: Preset[]
  activePresetId: string
}

type DroneState = {
  playing: boolean
  songName: string
  songLibrary: SongEntry[]
  activePresetId: string
  presets: Preset[]
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  referenceA4Hz: number
  baseOctave: number
  masterGainDb: number
  timbreBlend: {
    sine: number
    saw: number
    square: number
  }
  tones: ToneConfig[]
  partials: PartialConfig[]
  metronomeEnabled: boolean
  metronomeBpm: number
  metronomeVolumeDb: number
  setPlaying: (playing: boolean) => void
  togglePlaying: () => void
  setReferenceA4Hz: (frequency: number) => void
  nudgeReferenceA4Hz: (delta: number) => void
  setBaseOctave: (value: number) => void
  nudgeBaseOctave: (delta: number) => void
  setTuningSystemId: (value: TuningSystemId) => void
  setTonalCenter: (center: TonalCenter) => void
  setMasterGainDb: (db: number) => void
  setTimbreValue: (key: 'sine' | 'saw' | 'square', value: number) => void
  toggleToneEnabled: (noteId: NoteId) => void
  setToneEnabled: (noteId: NoteId, enabled: boolean) => void
  setToneGain: (noteId: NoteId, gainDb: number) => void
  setTonePan: (noteId: NoteId, pan: number) => void
  setPartialGain: (partialId: string, gainDb: number) => void
  setPartialRatio: (partialId: string, ratio: number) => void
  setPartialEnabled: (partialId: string, enabled: boolean) => void
  setPartials: (partials: PartialConfig[]) => void
  addPartial: () => void
  removePartial: (partialId: string) => void
  setTonePartials: (noteId: NoteId, partials: PartialConfig[]) => void
  setTonePartialGain: (noteId: NoteId, partialId: string, gainDb: number) => void
  setTonePartialRatio: (noteId: NoteId, partialId: string, ratio: number) => void
  setTonePartialEnabled: (noteId: NoteId, partialId: string, enabled: boolean) => void
  addTonePartial: (noteId: NoteId) => void
  removeTonePartial: (noteId: NoteId, partialId: string) => void
  setMetronomeEnabled: (enabled: boolean) => void
  setMetronomeBpm: (bpm: number) => void
  setMetronomeVolumeDb: (db: number) => void
  saveActivePreset: () => void
  saveAsPreset: () => void
  createNewPreset: () => void
  loadPreset: (presetId: string) => void
  renamePreset: (presetId: string, name: string) => void
  duplicatePreset: (presetId: string) => void
  deletePreset: (presetId: string) => void
  movePreset: (presetId: string, direction: 'up' | 'down') => void
  importSong: (songPresets: Preset[], activePresetId?: string, songName?: string) => void
  importSongLibrary: (
    songs: Array<{ id?: string; name?: string; presets?: Preset[]; activePresetId?: string }>,
  ) => void
  loadSongFromLibrary: (songId: string) => void
  deleteSongFromLibrary: (songId: string) => void
  moveSongInLibrary: (songId: string, direction: 'up' | 'down') => void
  saveCurrentSongToLibrary: (songName?: string) => void
  selectNextPreset: () => void
  selectPreviousPreset: () => void
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

function duplicatePresetData(preset: Preset): Preset {
  const partials = normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial })))
  return {
    ...preset,
    tones: migrateTones(preset.tones, partials),
    partials,
    timbreBlend: { ...preset.timbreBlend },
  }
}

function applyPresetState(preset: Preset): Pick<
  DroneState,
  | 'activePresetId'
  | 'tuningSystemId'
  | 'tonalCenter'
  | 'baseOctave'
  | 'masterGainDb'
  | 'timbreBlend'
  | 'tones'
  | 'partials'
> {
  return {
    activePresetId: preset.id,
    tuningSystemId: preset.tuningSystemId,
    tonalCenter: preset.tonalCenter,
    baseOctave: clamp(preset.baseOctave, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
    masterGainDb: preset.masterGainDb,
    timbreBlend: { ...preset.timbreBlend },
    tones: migrateTones(preset.tones, preset.partials ?? DEFAULT_PARTIALS),
    partials: normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial }))),
  }
}

const DEFAULT_PARTIALS = createDefaultPartials()
const INITIAL_PRESET = duplicatePresetData(DEFAULT_PRESETS[0])
const INITIAL_SONG_ID = 'song-default'

function normalizePartials(partials: PartialConfig[]): PartialConfig[] {
  const source = partials.length > 0 ? partials : DEFAULT_PARTIALS
  return source.slice(0, 16).map((partial, index) => ({
    ...partial,
    id: partial.id || `p${index + 1}`,
    ratio: clamp(partial.ratio, 0.0625, 32),
    gainDb: clamp(partial.gainDb, -48, 0),
  }))
}

function normalizeTonePartials(tone: ToneConfig, fallbackPartials: PartialConfig[]): ToneConfig {
  return {
    ...tone,
    partials: normalizePartials((tone.partials ?? fallbackPartials).map((partial) => ({ ...partial }))),
  }
}

function migrateTones(tones: ToneConfig[], fallbackPartials: PartialConfig[]): ToneConfig[] {
  const migratedById = new Map<NoteId, ToneConfig>()

  for (const tone of tones) {
    const noteId = migrateLegacyNoteId(tone.noteId)
    if (!noteId) {
      continue
    }
    const existing = migratedById.get(noteId)
    migratedById.set(noteId, {
      ...tone,
      noteId,
      enabled: existing?.enabled === true || tone.enabled,
      gainDb: existing?.gainDb ?? tone.gainDb,
      pan: existing?.pan ?? tone.pan,
    })
  }

  return NOTE_IDS.map((noteId) => {
    const tone = migratedById.get(noteId)
    if (tone) {
      return normalizeTonePartials(tone, fallbackPartials)
    }
    return normalizeTonePartials(
      {
        noteId,
        enabled: false,
        gainDb: noteId.endsWith('1') || noteId === 'g0' || noteId === 'a0' ? -18 : -12,
        pan: 0,
      },
      fallbackPartials,
    )
  })
}

export const useDroneStore = create<DroneState>()(
  persist(
    (set, get) => ({
      playing: false,
      songName: 'My Song',
      songLibrary: [
        {
          id: INITIAL_SONG_ID,
          name: 'My Song',
          presets: DEFAULT_PRESETS.map((preset) => duplicatePresetData(preset)),
          activePresetId: INITIAL_PRESET.id,
        },
      ],
      presets: DEFAULT_PRESETS.map((preset) => duplicatePresetData(preset)),
      activePresetId: INITIAL_PRESET.id,
      tuningSystemId: INITIAL_PRESET.tuningSystemId,
      tonalCenter: INITIAL_PRESET.tonalCenter,
      referenceA4Hz: 440,
      baseOctave: clamp(INITIAL_PRESET.baseOctave, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
      masterGainDb: INITIAL_PRESET.masterGainDb,
      timbreBlend: { ...INITIAL_PRESET.timbreBlend },
      tones: INITIAL_PRESET.tones.map((tone) => ({ ...tone })),
      partials: normalizePartials(INITIAL_PRESET.partials.map((partial) => ({ ...partial }))),
      metronomeEnabled: false,
      metronomeBpm: 72,
      metronomeVolumeDb: -15,
      setPlaying: (playing) => set({ playing }),
      togglePlaying: () => set((state) => ({ playing: !state.playing })),
      setReferenceA4Hz: (frequency) => set({ referenceA4Hz: clamp(frequency, 400, 480) }),
      nudgeReferenceA4Hz: (delta) =>
        set((state) => ({
          referenceA4Hz: clamp(Math.round((state.referenceA4Hz + delta) * 10) / 10, 400, 480),
        })),
      setBaseOctave: (value) =>
        set({
          baseOctave: Math.round(clamp(value, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE)),
        }),
      nudgeBaseOctave: (delta) =>
        set((state) => ({
          baseOctave: Math.round(
            clamp(state.baseOctave + delta, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
          ),
        })),
      setTuningSystemId: (value) => {
        const validValue = TUNING_SYSTEMS.some((item) => item.id === value)
          ? value
          : 'equal'
        set({ tuningSystemId: validValue })
      },
      setTonalCenter: (center) => {
        const validCenter = TONAL_CENTERS.includes(center) ? center : 'g'
        set({ tonalCenter: validCenter })
      },
      setMasterGainDb: (db) => set({ masterGainDb: clamp(db, -30, 0) }),
      setTimbreValue: (key, value) =>
        set((state) => ({
          timbreBlend: {
            ...state.timbreBlend,
            [key]: clamp(value, 0, 1),
          },
        })),
      toggleToneEnabled: (noteId) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            return {
              ...tone,
              enabled: !tone.enabled,
            }
          }),
        })),
      setToneEnabled: (noteId, enabled) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            return {
              ...tone,
              enabled,
            }
          }),
        })),
      setToneGain: (noteId, gainDb) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            return {
              ...tone,
              gainDb: clamp(gainDb, -40, 0),
            }
          }),
        })),
      setTonePan: (noteId, pan) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            return {
              ...tone,
              pan: clamp(pan, -1, 1),
            }
          }),
        })),
      setPartialGain: (partialId, gainDb) =>
        set((state) => ({
          partials: state.partials.map((partial) => {
            if (partial.id !== partialId) {
              return partial
            }
            return {
              ...partial,
              gainDb: clamp(gainDb, -48, 0),
            }
          }),
        })),
      setPartialRatio: (partialId, ratio) =>
        set((state) => ({
          partials: state.partials.map((partial) => {
            if (partial.id !== partialId) {
              return partial
            }
            return {
              ...partial,
              ratio: clamp(ratio, 0.0625, 32),
            }
          }),
        })),
      setPartialEnabled: (partialId, enabled) =>
        set((state) => ({
          partials: state.partials.map((partial) => {
            if (partial.id !== partialId) {
              return partial
            }
            return {
              ...partial,
              enabled,
            }
          }),
        })),
      setPartials: (partials) =>
        set({
          partials: normalizePartials(partials.map((partial) => ({ ...partial }))),
        }),
      addPartial: () =>
        set((state) => {
          const nextIndex = state.partials.length + 1
          return {
            partials: [
              ...state.partials,
              {
                id: `p-${Date.now()}-${nextIndex}`,
                ratio: nextIndex,
                gainDb: -24,
                enabled: true,
              },
            ],
          }
        }),
      removePartial: (partialId) =>
        set((state) => {
          if (state.partials.length <= 1) {
            return state
          }
          return {
            partials: state.partials.filter((partial) => partial.id !== partialId),
          }
        }),
      setTonePartials: (noteId, partials) =>
        set((state) => ({
          tones: state.tones.map((tone) =>
            tone.noteId === noteId
              ? {
                  ...tone,
                  partials: normalizePartials(partials.map((partial) => ({ ...partial }))),
                }
              : tone,
          ),
        })),
      setTonePartialGain: (noteId, partialId, gainDb) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = tone.partials ?? state.partials
            return {
              ...tone,
              partials: normalizePartials(
                source.map((partial) =>
                  partial.id === partialId
                    ? {
                        ...partial,
                        gainDb: clamp(gainDb, -48, 0),
                      }
                    : partial,
                ),
              ),
            }
          }),
        })),
      setTonePartialRatio: (noteId, partialId, ratio) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = tone.partials ?? state.partials
            return {
              ...tone,
              partials: normalizePartials(
                source.map((partial) =>
                  partial.id === partialId
                    ? {
                        ...partial,
                        ratio: clamp(ratio, 0.0625, 32),
                      }
                    : partial,
                ),
              ),
            }
          }),
        })),
      setTonePartialEnabled: (noteId, partialId, enabled) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = tone.partials ?? state.partials
            return {
              ...tone,
              partials: normalizePartials(
                source.map((partial) =>
                  partial.id === partialId
                    ? {
                        ...partial,
                        enabled,
                      }
                    : partial,
                ),
              ),
            }
          }),
        })),
      addTonePartial: (noteId) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = normalizePartials(tone.partials ?? state.partials)
            const nextIndex = source.length + 1
            return {
              ...tone,
              partials: [
                ...source,
                {
                  id: `p-${Date.now()}-${nextIndex}`,
                  ratio: nextIndex,
                  gainDb: -24,
                  enabled: true,
                },
              ],
            }
          }),
        })),
      removeTonePartial: (noteId, partialId) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = normalizePartials(tone.partials ?? state.partials)
            if (source.length <= 1) {
              return tone
            }
            return {
              ...tone,
              partials: source.filter((partial) => partial.id !== partialId),
            }
          }),
        })),
      setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
      setMetronomeBpm: (bpm) => set({ metronomeBpm: clamp(bpm, 30, 220) }),
      setMetronomeVolumeDb: (db) => set({ metronomeVolumeDb: clamp(db, -40, 0) }),
      saveActivePreset: () =>
        set((state) => {
          const presetIndex = state.presets.findIndex((preset) => preset.id === state.activePresetId)
          if (presetIndex < 0) {
            return state
          }
          const updatedPreset: Preset = {
            id: state.activePresetId,
            name: state.presets[presetIndex].name,
            tuningSystemId: state.tuningSystemId,
            tonalCenter: state.tonalCenter,
            baseOctave: state.baseOctave,
            masterGainDb: state.masterGainDb,
            timbreBlend: { ...state.timbreBlend },
            tones: state.tones.map((tone) => normalizeTonePartials(tone, state.partials)),
            partials: normalizePartials(state.partials.map((partial) => ({ ...partial }))),
          }
          const presets = state.presets.map((preset) => {
            if (preset.id !== state.activePresetId) {
              return preset
            }
            return updatedPreset
          })
          return { presets }
        }),
      saveAsPreset: () =>
        set((state) => {
          const sequence = state.presets.length + 1
          const nextPreset: Preset = {
            id: `preset-${Date.now()}`,
            name: `Preset ${sequence}`,
            tuningSystemId: state.tuningSystemId,
            tonalCenter: state.tonalCenter,
            baseOctave: state.baseOctave,
            masterGainDb: state.masterGainDb,
            timbreBlend: { ...state.timbreBlend },
            tones: state.tones.map((tone) => normalizeTonePartials(tone, state.partials)),
            partials: normalizePartials(state.partials.map((partial) => ({ ...partial }))),
          }
          return {
            presets: [...state.presets, nextPreset],
            activePresetId: nextPreset.id,
          }
        }),
      createNewPreset: () =>
        set((state) => {
          const template = duplicatePresetData(DEFAULT_PRESETS[0])
          const nextPreset: Preset = {
            ...template,
            id: `preset-${Date.now()}`,
            name: 'New preset',
          }
          return {
            presets: [...state.presets, nextPreset],
            ...applyPresetState(nextPreset),
          }
        }),
      loadPreset: (presetId) => {
        const preset = get().presets.find((item) => item.id === presetId)
        if (!preset) {
          return
        }
        set({
          ...applyPresetState(preset),
        })
      },
      renamePreset: (presetId, name) =>
        set((state) => {
          const trimmed = name.trim()
          if (!trimmed) {
            return state
          }
          return {
            presets: state.presets.map((preset) =>
              preset.id === presetId ? { ...preset, name: trimmed } : preset,
            ),
          }
        }),
      duplicatePreset: (presetId) =>
        set((state) => {
          const source = state.presets.find((preset) => preset.id === presetId)
          if (!source) {
            return state
          }
          const duplicate = duplicatePresetData(source)
          duplicate.id = `preset-${Date.now()}`
          duplicate.name = `${source.name} Copy`
          return {
            presets: [...state.presets, duplicate],
            activePresetId: duplicate.id,
          }
        }),
      deletePreset: (presetId) =>
        set((state) => {
          if (state.presets.length <= 1) {
            return state
          }
          const filtered = state.presets.filter((preset) => preset.id !== presetId)
          const nextActive = filtered[0]
          const activeStillExists = filtered.some((preset) => preset.id === state.activePresetId)
          if (activeStillExists) {
            return {
              presets: filtered,
            }
          }
          return {
            presets: filtered,
            ...applyPresetState(nextActive),
          }
        }),
      movePreset: (presetId, direction) =>
        set((state) => {
          const index = state.presets.findIndex((preset) => preset.id === presetId)
          if (index < 0) {
            return state
          }
          const swapIndex = direction === 'up' ? index - 1 : index + 1
          if (swapIndex < 0 || swapIndex >= state.presets.length) {
            return state
          }
          const next = [...state.presets]
          const current = next[index]
          next[index] = next[swapIndex]
          next[swapIndex] = current
          return { presets: next }
        }),
      importSong: (songPresets, activePresetId, songName) =>
        set((state) => {
          if (!Array.isArray(songPresets) || songPresets.length === 0) {
            return state
          }
          const usedIds = new Set<string>()
          const imported = songPresets.map((preset, index) => {
            const trimmedName = preset.name?.trim()
            const baseId = preset.id?.trim() || `preset-${Date.now()}-${index + 1}`
            let nextId = baseId
            let collisionIndex = 2
            while (usedIds.has(nextId)) {
              nextId = `${baseId}-${collisionIndex}`
              collisionIndex += 1
            }
            usedIds.add(nextId)
            return {
              ...duplicatePresetData(preset),
              id: nextId,
              name: trimmedName || `Preset ${index + 1}`,
              baseOctave: clamp(preset.baseOctave ?? 3, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
              partials: normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial }))),
            }
          })
          const active =
            imported.find((preset) => preset.id === activePresetId) ?? imported[0]
          const resolvedSongName = songName?.trim() || 'Imported Song'
          const importedSong: SongEntry = {
            id: `song-${Date.now()}`,
            name: resolvedSongName,
            presets: imported.map((preset) => duplicatePresetData(preset)),
            activePresetId: active.id,
          }
          return {
            songName: resolvedSongName,
            songLibrary: [...state.songLibrary, importedSong],
            presets: imported,
            ...applyPresetState(active),
          }
        }),
      importSongLibrary: (songs) =>
        set((state) => {
          if (!Array.isArray(songs) || songs.length === 0) {
            return state
          }

          const usedSongIds = new Set<string>()
          const importedSongs: SongEntry[] = []

          for (const song of songs) {
            if (!Array.isArray(song.presets) || song.presets.length === 0) {
              continue
            }

            const usedPresetIds = new Set<string>()
            const importedPresets = song.presets.map((preset, index) => {
              const trimmedName = preset.name?.trim()
              const baseId = preset.id?.trim() || `preset-${Date.now()}-${index + 1}`
              let nextId = baseId
              let collisionIndex = 2
              while (usedPresetIds.has(nextId)) {
                nextId = `${baseId}-${collisionIndex}`
                collisionIndex += 1
              }
              usedPresetIds.add(nextId)
              return {
                ...duplicatePresetData(preset),
                id: nextId,
                name: trimmedName || `Preset ${index + 1}`,
                baseOctave: clamp(preset.baseOctave ?? 3, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
                partials: normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial }))),
              }
            })

            const active =
              importedPresets.find((preset) => preset.id === song.activePresetId) ?? importedPresets[0]
            const baseSongId = song.id?.trim() || `song-${Date.now()}-${importedSongs.length + 1}`
            let nextSongId = baseSongId
            let songCollisionIndex = 2
            while (usedSongIds.has(nextSongId)) {
              nextSongId = `${baseSongId}-${songCollisionIndex}`
              songCollisionIndex += 1
            }
            usedSongIds.add(nextSongId)

            importedSongs.push({
              id: nextSongId,
              name: song.name?.trim() || `Imported Song ${importedSongs.length + 1}`,
              presets: importedPresets.map((preset) => duplicatePresetData(preset)),
              activePresetId: active.id,
            })
          }

          if (importedSongs.length === 0) {
            return state
          }

          const activeSong = importedSongs[0]
          const copiedPresets = activeSong.presets.map((preset) => duplicatePresetData(preset))
          const activePreset =
            copiedPresets.find((preset) => preset.id === activeSong.activePresetId) ?? copiedPresets[0]

          return {
            songName: activeSong.name,
            songLibrary: importedSongs,
            presets: copiedPresets,
            ...applyPresetState(activePreset),
          }
        }),
      loadSongFromLibrary: (songId) =>
        set((state) => {
          const song = state.songLibrary.find((entry) => entry.id === songId)
          if (!song || song.presets.length === 0) {
            return state
          }
          const copiedPresets = song.presets.map((preset) => duplicatePresetData(preset))
          const active = copiedPresets.find((preset) => preset.id === song.activePresetId) ?? copiedPresets[0]
          return {
            songName: song.name,
            songLibrary: state.songLibrary,
            presets: copiedPresets,
            ...applyPresetState(active),
          }
        }),
      deleteSongFromLibrary: (songId) =>
        set((state) => {
          if (state.songLibrary.length <= 1) {
            return state
          }
          const target = state.songLibrary.find((entry) => entry.id === songId)
          if (!target) {
            return state
          }
          const filtered = state.songLibrary.filter((entry) => entry.id !== songId)
          if (filtered.length === 0) {
            return state
          }
          const isDeletingActiveSong = state.songName === target.name
          if (!isDeletingActiveSong) {
            return {
              songLibrary: filtered,
            }
          }
          const fallbackSong = filtered[0]
          const copiedPresets = fallbackSong.presets.map((preset) => duplicatePresetData(preset))
          const active = copiedPresets.find((preset) => preset.id === fallbackSong.activePresetId) ?? copiedPresets[0]
          return {
            songName: fallbackSong.name,
            songLibrary: filtered,
            presets: copiedPresets,
            ...applyPresetState(active),
          }
        }),
      moveSongInLibrary: (songId, direction) =>
        set((state) => {
          const index = state.songLibrary.findIndex((entry) => entry.id === songId)
          if (index < 0) {
            return state
          }
          const swapIndex = direction === 'up' ? index - 1 : index + 1
          if (swapIndex < 0 || swapIndex >= state.songLibrary.length) {
            return state
          }
          const nextLibrary = [...state.songLibrary]
          const current = nextLibrary[index]
          nextLibrary[index] = nextLibrary[swapIndex]
          nextLibrary[swapIndex] = current
          return {
            songLibrary: nextLibrary,
          }
        }),
      saveCurrentSongToLibrary: (songName) =>
        set((state) => {
          const resolvedName = songName?.trim() || state.songName || 'My Song'
          const currentIndex = state.songLibrary.findIndex((entry) => entry.name === state.songName)
          const snapshot: Omit<SongEntry, 'id' | 'name'> = {
            presets: state.presets.map((preset) => duplicatePresetData(preset)),
            activePresetId: state.activePresetId,
          }
          let nextLibrary = [...state.songLibrary]
          if (currentIndex >= 0) {
            nextLibrary[currentIndex] = {
              ...nextLibrary[currentIndex],
              ...snapshot,
              name: resolvedName,
            }
          } else {
            const byNameIndex = nextLibrary.findIndex((entry) => entry.name === resolvedName)
            if (byNameIndex >= 0) {
              nextLibrary[byNameIndex] = {
                ...nextLibrary[byNameIndex],
                ...snapshot,
                name: resolvedName,
              }
            } else {
              nextLibrary.push({
                id: `song-${Date.now()}`,
                name: resolvedName,
                ...snapshot,
              })
            }
          }
          return {
            songName: resolvedName,
            songLibrary: nextLibrary,
          }
        }),
      selectNextPreset: () => {
        const state = get()
        const index = state.presets.findIndex((preset) => preset.id === state.activePresetId)
        if (index < 0) {
          return
        }
        const nextIndex = (index + 1) % state.presets.length
        const preset = state.presets[nextIndex]
        set({
          ...applyPresetState(preset),
        })
      },
      selectPreviousPreset: () => {
        const state = get()
        const index = state.presets.findIndex((preset) => preset.id === state.activePresetId)
        if (index < 0) {
          return
        }
        const nextIndex = (index - 1 + state.presets.length) % state.presets.length
        const preset = state.presets[nextIndex]
        set({
          ...applyPresetState(preset),
        })
      },
    }),
    {
      name: 'bourdon-store-v1',
      version: 6,
      migrate: (persistedState) => {
        const typed = persistedState as Partial<DroneState> | undefined
        if (!typed) {
          return persistedState
        }
        const incomingPartials = normalizePartials(typed.partials ?? [])
        const migratedPresets = (typed.presets ?? []).map((preset) =>
          duplicatePresetData({
            ...preset,
            baseOctave: clamp(
              preset.baseOctave ?? 3,
              MIN_BASE_OCTAVE,
              MAX_BASE_OCTAVE,
            ),
            partials: normalizePartials(preset.partials ?? incomingPartials),
            tones: migrateTones(preset.tones ?? [], preset.partials ?? incomingPartials),
          }),
        )
        const migratedTones = migrateTones(typed.tones ?? INITIAL_PRESET.tones, incomingPartials)
        return {
          ...typed,
          presets: migratedPresets,
          partials: incomingPartials,
          tones: migratedTones,
          baseOctave: clamp(typed.baseOctave ?? 3, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
          songName: typed.songName ?? 'My Song',
          songLibrary:
            typed.songLibrary?.map((song) => ({
              ...song,
              presets: song.presets.map((preset) => duplicatePresetData(preset)),
            })) ?? [
              {
                id: INITIAL_SONG_ID,
                name: typed.songName ?? 'My Song',
                presets: migratedPresets.length
                  ? migratedPresets.map((preset) => duplicatePresetData(preset))
                  : DEFAULT_PRESETS.map((preset) => duplicatePresetData(preset)),
                activePresetId: typed.activePresetId ?? INITIAL_PRESET.id,
              },
            ],
          metronomeEnabled: typed.metronomeEnabled ?? false,
          metronomeBpm: typed.metronomeBpm ?? 72,
          metronomeVolumeDb: typed.metronomeVolumeDb ?? -15,
        }
      },
      partialize: (state) => ({
        presets: state.presets,
        songName: state.songName,
        songLibrary: state.songLibrary,
        activePresetId: state.activePresetId,
        tuningSystemId: state.tuningSystemId,
        tonalCenter: state.tonalCenter,
        referenceA4Hz: state.referenceA4Hz,
        baseOctave: state.baseOctave,
        masterGainDb: state.masterGainDb,
        timbreBlend: state.timbreBlend,
        tones: state.tones,
        partials: state.partials,
        metronomeEnabled: state.metronomeEnabled,
        metronomeBpm: state.metronomeBpm,
        metronomeVolumeDb: state.metronomeVolumeDb,
      }),
    },
  ),
)

export const selectCurrentPreset = (state: DroneState): Preset | undefined =>
  state.presets.find((preset) => preset.id === state.activePresetId)

export const selectEnabledTones = (state: DroneState): ToneConfig[] =>
  state.tones.filter((tone) => tone.enabled)

export const selectNoteById = (state: DroneState, noteId: NoteId): ToneConfig | undefined =>
  state.tones.find((tone) => tone.noteId === noteId)
