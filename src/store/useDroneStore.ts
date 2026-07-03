import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PartialConfig, TimbreBlend, ToneConfig } from '../audio/types'
import type { BtControlMode } from '../bluetooth/types'
import { TONAL_CENTERS, migrateLegacyNoteId, NOTE_IDS, type NoteId, type TonalCenter } from '../music/notes'
import {
  MAX_BASE_OCTAVE,
  MIN_BASE_OCTAVE,
  TUNING_SYSTEMS,
  type TuningSystemId,
} from '../music/tuning'
import {
  createDefaultPartials,
  createDefaultShine,
  DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS,
  DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS,
  DEFAULT_ENTRY_GLIDE_LOWEST_CENTS,
  DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS,
  DEFAULT_PRESETS,
  DEFAULT_TIMBRE_BLEND,
  DEFAULT_TONE_DETUNE_CENTS,
  MAX_TONE_DETUNE_CENTS,
  MIN_TONE_DETUNE_CENTS,
  SHINE_HARMONIC_COUNT,
  type Preset,
  type ShineConfig,
} from '../presets/defaultPresets'

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
  harmonicTimbreEnabled: boolean
  entryGlideEnabled: boolean
  entryGlideLowestCents: number
  entryGlideLowestSeconds: number
  entryGlideHighestCents: number
  entryGlideHighestSeconds: number
  globalOvertoneEditEnabled: boolean
  tones: ToneConfig[]
  partials: PartialConfig[]
  shine: ShineConfig
  metronomeEnabled: boolean
  metronomeBpm: number
  metronomeVolumeDb: number
  metronomeMuted: boolean
  controlsLocked: boolean
  btControlMode: BtControlMode
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
  setToneTimbreValue: (noteId: NoteId, key: 'sine' | 'saw' | 'square', value: number) => void
  setToneTimbreBlend: (noteId: NoteId, timbreBlend: TimbreBlend) => void
  setHarmonicTimbreEnabled: (enabled: boolean) => void
  toggleHarmonicTimbreEnabled: () => void
  setEntryGlideEnabled: (enabled: boolean) => void
  toggleEntryGlideEnabled: () => void
  setEntryGlideLowestCents: (cents: number) => void
  setEntryGlideLowestSeconds: (seconds: number) => void
  setEntryGlideHighestCents: (cents: number) => void
  setEntryGlideHighestSeconds: (seconds: number) => void
  setGlobalOvertoneEditEnabled: (enabled: boolean) => void
  enableGlobalOvertoneEditFromTone: (noteId: NoteId) => void
  applyPartialsGlobally: (partials: PartialConfig[]) => void
  setAllPartialGain: (partialId: string, gainDb: number) => void
  setAllPartialRatio: (partialId: string, ratio: number) => void
  setAllPartialEnabled: (partialId: string, enabled: boolean) => void
  addPartialGlobally: () => void
  removePartialGlobally: (partialId: string) => void
  toggleToneEnabled: (noteId: NoteId) => void
  setToneEnabled: (noteId: NoteId, enabled: boolean) => void
  setToneGain: (noteId: NoteId, gainDb: number) => void
  setTonePan: (noteId: NoteId, pan: number) => void
  setToneDetune: (noteId: NoteId, detuneCents: number) => void
  setShine: (shine: ShineConfig) => void
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
  setMetronomeMuted: (muted: boolean) => void
  setControlsLocked: (locked: boolean) => void
  toggleControlsLocked: () => void
  setBtControlMode: (mode: BtControlMode) => void
  saveActivePreset: () => void
  savePreset: (presetId: string) => void
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
  saveAsNewSong: (songName?: string) => void
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

function normalizeBooleanArray(source: unknown, fallback: boolean): boolean[] {
  const input = Array.isArray(source) ? source : []
  return Array.from({ length: SHINE_HARMONIC_COUNT }, (_, index) =>
    typeof input[index] === 'boolean' ? (input[index] as boolean) : fallback,
  )
}

function normalizeShine(shine: ShineConfig | undefined): ShineConfig {
  const source = shine ?? createDefaultShine()
  const levelsInput = Array.isArray(source.levels) ? source.levels : []
  return {
    enabled: Boolean(source.enabled),
    volume: clamp(typeof source.volume === 'number' ? source.volume : 0.6, 0, 1),
    octaveIndex: clamp(Math.round(source.octaveIndex ?? 2), 0, 4),
    levels: Array.from({ length: SHINE_HARMONIC_COUNT }, (_, index) =>
      clamp(typeof levelsInput[index] === 'number' ? levelsInput[index] : 0, 0, 1),
    ),
    autos: normalizeBooleanArray(source.autos, true),
    bumps: normalizeBooleanArray(source.bumps, false),
  }
}

function duplicatePresetData(preset: Preset): Preset {
  const partials = normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial })))
  const timbreBlend = normalizeTimbreBlend(preset.timbreBlend ?? DEFAULT_TIMBRE_BLEND)
  return {
    ...preset,
    tones: migrateTones(preset.tones, partials, timbreBlend),
    partials,
    timbreBlend,
    shine: normalizeShine(preset.shine),
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
  | 'shine'
> {
  return {
    activePresetId: preset.id,
    tuningSystemId: preset.tuningSystemId,
    tonalCenter: preset.tonalCenter,
    baseOctave: clamp(preset.baseOctave, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE),
    masterGainDb: preset.masterGainDb,
    tones: migrateTones(
      preset.tones,
      preset.partials ?? DEFAULT_PARTIALS,
      normalizeTimbreBlend(preset.timbreBlend ?? DEFAULT_TIMBRE_BLEND),
    ),
    partials: normalizePartials((preset.partials ?? DEFAULT_PARTIALS).map((partial) => ({ ...partial }))),
    timbreBlend: normalizeTimbreBlend(preset.timbreBlend ?? DEFAULT_TIMBRE_BLEND),
    shine: normalizeShine(preset.shine),
  }
}

function snapshotPresetFromState(
  state: Pick<
    DroneState,
    'tuningSystemId' | 'tonalCenter' | 'baseOctave' | 'masterGainDb' | 'timbreBlend' | 'tones' | 'partials' | 'shine'
  >,
  presetId: string,
  name: string,
): Preset {
  return {
    id: presetId,
    name,
    tuningSystemId: state.tuningSystemId,
    tonalCenter: state.tonalCenter,
    baseOctave: state.baseOctave,
    masterGainDb: state.masterGainDb,
    timbreBlend: { ...state.timbreBlend },
    tones: state.tones.map((tone) => normalizeTone(tone, state.partials, state.timbreBlend)),
    partials: normalizePartials(state.partials.map((partial) => ({ ...partial }))),
    shine: normalizeShine(state.shine),
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

function normalizeTimbreBlend(timbreBlend: TimbreBlend): TimbreBlend {
  return {
    sine: clamp(timbreBlend.sine, 0, 1),
    saw: clamp(timbreBlend.saw, 0, 1),
    square: clamp(timbreBlend.square, 0, 1),
  }
}

function normalizeTonePartials(tone: ToneConfig, fallbackPartials: PartialConfig[]): ToneConfig {
  return {
    ...tone,
    detuneCents: clamp(tone.detuneCents ?? DEFAULT_TONE_DETUNE_CENTS, MIN_TONE_DETUNE_CENTS, MAX_TONE_DETUNE_CENTS),
    partials: normalizePartials((tone.partials ?? fallbackPartials).map((partial) => ({ ...partial }))),
  }
}

function normalizeToneTimbre(tone: ToneConfig, fallbackTimbre: TimbreBlend): ToneConfig {
  return {
    ...tone,
    timbreBlend: normalizeTimbreBlend(tone.timbreBlend ?? fallbackTimbre),
  }
}

function normalizeTone(
  tone: ToneConfig,
  fallbackPartials: PartialConfig[],
  fallbackTimbre: TimbreBlend,
): ToneConfig {
  return normalizeToneTimbre(normalizeTonePartials(tone, fallbackPartials), fallbackTimbre)
}

function syncAllTonesWithPartials(
  state: Pick<DroneState, 'tones'>,
  partials: PartialConfig[],
): Pick<DroneState, 'partials' | 'tones'> {
  const normalized = normalizePartials(partials.map((partial) => ({ ...partial })))
  return {
    partials: normalized,
    tones: state.tones.map((tone) => ({
      ...tone,
      partials: normalized.map((partial) => ({ ...partial })),
    })),
  }
}

function syncAllTonesWithTimbre(
  state: Pick<DroneState, 'tones' | 'timbreBlend'>,
  timbreBlend: TimbreBlend,
): Pick<DroneState, 'timbreBlend' | 'tones'> {
  const normalized = normalizeTimbreBlend(timbreBlend)
  return {
    timbreBlend: normalized,
    tones: state.tones.map((tone) => ({
      ...tone,
      timbreBlend: { ...normalized },
    })),
  }
}

function migrateTones(
  tones: ToneConfig[],
  fallbackPartials: PartialConfig[],
  fallbackTimbre: TimbreBlend = DEFAULT_TIMBRE_BLEND,
): ToneConfig[] {
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
      detuneCents: existing?.detuneCents ?? tone.detuneCents ?? DEFAULT_TONE_DETUNE_CENTS,
    })
  }

  return NOTE_IDS.map((noteId) => {
    const tone = migratedById.get(noteId)
    if (tone) {
      return normalizeTone(tone, fallbackPartials, fallbackTimbre)
    }
    return normalizeTone(
      {
        noteId,
        enabled: false,
        gainDb: noteId.endsWith('1') || noteId.endsWith('2') ? -18 : -12,
        pan: 0,
        detuneCents: DEFAULT_TONE_DETUNE_CENTS,
      },
      fallbackPartials,
      fallbackTimbre,
    )
  })
}

function syncPresetsToCurrentSong(
  state: Pick<DroneState, 'presets' | 'activePresetId' | 'songName' | 'songLibrary'>,
): Pick<DroneState, 'songLibrary'> | Record<string, never> {
  const currentIndex = state.songLibrary.findIndex((entry) => entry.name === state.songName)
  if (currentIndex < 0) {
    return {}
  }
  const nextLibrary = [...state.songLibrary]
  nextLibrary[currentIndex] = {
    ...nextLibrary[currentIndex],
    presets: state.presets.map((preset) => duplicatePresetData(preset)),
    activePresetId: state.activePresetId,
  }
  return { songLibrary: nextLibrary }
}

function resolveActivePresetId(presets: Preset[], activePresetId: string | undefined): string {
  if (activePresetId && presets.some((preset) => preset.id === activePresetId)) {
    return activePresetId
  }
  return presets[0]?.id ?? INITIAL_PRESET.id
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
      harmonicTimbreEnabled: true,
      entryGlideEnabled: true,
      entryGlideLowestCents: DEFAULT_ENTRY_GLIDE_LOWEST_CENTS,
      entryGlideLowestSeconds: DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS,
      entryGlideHighestCents: DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS,
      entryGlideHighestSeconds: DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS,
      globalOvertoneEditEnabled: false,
      tones: INITIAL_PRESET.tones.map((tone) => ({ ...tone })),
      partials: normalizePartials(INITIAL_PRESET.partials.map((partial) => ({ ...partial }))),
      shine: normalizeShine(INITIAL_PRESET.shine),
      metronomeEnabled: false,
      metronomeBpm: 72,
      metronomeVolumeDb: -15,
      metronomeMuted: false,
      controlsLocked: false,
      btControlMode: 'pedal',
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
        set((state) =>
          syncAllTonesWithTimbre(state, {
            ...state.timbreBlend,
            [key]: clamp(value, 0, 1),
          }),
        ),
      setToneTimbreValue: (noteId, key, value) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            const source = tone.timbreBlend ?? state.timbreBlend
            return {
              ...tone,
              timbreBlend: normalizeTimbreBlend({
                ...source,
                [key]: clamp(value, 0, 1),
              }),
            }
          }),
        })),
      setToneTimbreBlend: (noteId, timbreBlend) =>
        set((state) => ({
          tones: state.tones.map((tone) =>
            tone.noteId === noteId
              ? {
                  ...tone,
                  timbreBlend: normalizeTimbreBlend(timbreBlend),
                }
              : tone,
          ),
        })),
      setHarmonicTimbreEnabled: (enabled) => set({ harmonicTimbreEnabled: enabled }),
      toggleHarmonicTimbreEnabled: () =>
        set((state) => ({ harmonicTimbreEnabled: !state.harmonicTimbreEnabled })),
      setEntryGlideEnabled: (enabled) => set({ entryGlideEnabled: enabled }),
      toggleEntryGlideEnabled: () =>
        set((state) => ({ entryGlideEnabled: !state.entryGlideEnabled })),
      setEntryGlideLowestCents: (cents) =>
        set({ entryGlideLowestCents: clamp(Math.round(cents), -50, 50) }),
      setEntryGlideLowestSeconds: (seconds) =>
        set({ entryGlideLowestSeconds: clamp(Math.round(seconds * 10) / 10, 0, 4) }),
      setEntryGlideHighestCents: (cents) =>
        set({ entryGlideHighestCents: clamp(Math.round(cents), -50, 50) }),
      setEntryGlideHighestSeconds: (seconds) =>
        set({ entryGlideHighestSeconds: clamp(Math.round(seconds * 10) / 10, 0, 4) }),
      setGlobalOvertoneEditEnabled: (enabled) => set({ globalOvertoneEditEnabled: enabled }),
      enableGlobalOvertoneEditFromTone: (noteId) =>
        set((state) => {
          const tone = state.tones.find((entry) => entry.noteId === noteId)
          const partialSource = tone?.partials ?? state.partials
          const timbreSource = tone?.timbreBlend ?? state.timbreBlend
          const partialSync = syncAllTonesWithPartials(state, partialSource)
          return {
            globalOvertoneEditEnabled: true,
            ...partialSync,
            ...syncAllTonesWithTimbre(
              { tones: partialSync.tones, timbreBlend: state.timbreBlend },
              timbreSource,
            ),
          }
        }),
      applyPartialsGlobally: (partials) =>
        set((state) => syncAllTonesWithPartials(state, partials)),
      setAllPartialGain: (partialId, gainDb) =>
        set((state) => ({
          ...syncAllTonesWithPartials(
            state,
            state.partials.map((partial) =>
              partial.id === partialId
                ? {
                    ...partial,
                    gainDb: clamp(gainDb, -48, 0),
                  }
                : partial,
            ),
          ),
        })),
      setAllPartialRatio: (partialId, ratio) =>
        set((state) => ({
          ...syncAllTonesWithPartials(
            state,
            state.partials.map((partial) =>
              partial.id === partialId
                ? {
                    ...partial,
                    ratio: clamp(ratio, 0.0625, 32),
                  }
                : partial,
            ),
          ),
        })),
      setAllPartialEnabled: (partialId, enabled) =>
        set((state) => ({
          ...syncAllTonesWithPartials(
            state,
            state.partials.map((partial) =>
              partial.id === partialId
                ? {
                    ...partial,
                    enabled,
                  }
                : partial,
            ),
          ),
        })),
      addPartialGlobally: () =>
        set((state) => {
          const nextIndex = state.partials.length + 1
          return syncAllTonesWithPartials(state, [
            ...state.partials,
            {
              id: `p-${Date.now()}-${nextIndex}`,
              ratio: nextIndex,
              gainDb: -24,
              enabled: true,
            },
          ])
        }),
      removePartialGlobally: (partialId) =>
        set((state) => {
          if (state.partials.length <= 1) {
            return state
          }
          return syncAllTonesWithPartials(
            state,
            state.partials.filter((partial) => partial.id !== partialId),
          )
        }),
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
      setToneDetune: (noteId, detuneCents) =>
        set((state) => ({
          tones: state.tones.map((tone) => {
            if (tone.noteId !== noteId) {
              return tone
            }
            return {
              ...tone,
              detuneCents: clamp(detuneCents, MIN_TONE_DETUNE_CENTS, MAX_TONE_DETUNE_CENTS),
            }
          }),
        })),
      setShine: (shine) => set({ shine: normalizeShine(shine) }),
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
      setMetronomeMuted: (muted) => set({ metronomeMuted: muted }),
      setControlsLocked: (locked) => set({ controlsLocked: locked }),
      toggleControlsLocked: () => set((state) => ({ controlsLocked: !state.controlsLocked })),
      setBtControlMode: (mode) => set({ btControlMode: mode }),
      saveActivePreset: () => {
        const { activePresetId } = get()
        get().savePreset(activePresetId)
      },
      savePreset: (presetId) =>
        set((state) => {
          const target = state.presets.find((preset) => preset.id === presetId)
          if (!target) {
            return state
          }
          const updatedPreset = snapshotPresetFromState(state, presetId, target.name)
          const presets = state.presets.map((preset) => (preset.id === presetId ? updatedPreset : preset))
          return {
            presets,
            ...syncPresetsToCurrentSong({ ...state, presets }),
          }
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
            tones: state.tones.map((tone) => normalizeTone(tone, state.partials, state.timbreBlend)),
            partials: normalizePartials(state.partials.map((partial) => ({ ...partial }))),
            shine: normalizeShine(state.shine),
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
        set(applyPresetState(preset))
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
      saveAsNewSong: (songName) =>
        set((state) => {
          const baseName = songName?.trim() || `${state.songName || 'Song'} copy`
          const existingNames = new Set(state.songLibrary.map((entry) => entry.name))
          let resolvedName = baseName
          let collisionIndex = 2
          while (existingNames.has(resolvedName)) {
            resolvedName = `${baseName} ${collisionIndex}`
            collisionIndex += 1
          }
          const newSong: SongEntry = {
            id: `song-${Date.now()}`,
            name: resolvedName,
            presets: state.presets.map((preset) => duplicatePresetData(preset)),
            activePresetId: state.activePresetId,
          }
          return {
            songName: resolvedName,
            songLibrary: [...state.songLibrary, newSong],
          }
        }),
      selectNextPreset: () => {
        const state = get()
        if (state.presets.length === 0) {
          return
        }
        const index = state.presets.findIndex((preset) => preset.id === state.activePresetId)
        const nextIndex = index < 0 ? 0 : (index + 1) % state.presets.length
        const preset = state.presets[nextIndex]
        set({
          ...applyPresetState(preset),
        })
      },
      selectPreviousPreset: () => {
        const state = get()
        if (state.presets.length === 0) {
          return
        }
        const index = state.presets.findIndex((preset) => preset.id === state.activePresetId)
        const nextIndex =
          index < 0 ? 0 : (index - 1 + state.presets.length) % state.presets.length
        const preset = state.presets[nextIndex]
        set({
          ...applyPresetState(preset),
        })
      },
    }),
    {
      name: 'bourdon-store-v1',
      version: 16,
      migrate: (persistedState) => {
        const typed = persistedState as Partial<DroneState> | undefined
        if (!typed) {
          return persistedState
        }
        const incomingPartials = normalizePartials(typed.partials ?? [])
        const incomingTimbre = normalizeTimbreBlend(typed.timbreBlend ?? DEFAULT_TIMBRE_BLEND)
        const migratedPresets = (typed.presets ?? []).map((preset) =>
          duplicatePresetData({
            ...preset,
            baseOctave: clamp(
              preset.baseOctave ?? 3,
              MIN_BASE_OCTAVE,
              MAX_BASE_OCTAVE,
            ),
            partials: normalizePartials(preset.partials ?? incomingPartials),
            timbreBlend: normalizeTimbreBlend(preset.timbreBlend ?? incomingTimbre),
            tones: migrateTones(
              preset.tones ?? [],
              preset.partials ?? incomingPartials,
              normalizeTimbreBlend(preset.timbreBlend ?? incomingTimbre),
            ),
          }),
        )
        const resolvedActivePresetId = resolveActivePresetId(
          migratedPresets.length ? migratedPresets : DEFAULT_PRESETS.map((preset) => duplicatePresetData(preset)),
          typed.activePresetId,
        )
        const migratedTones = migrateTones(
          typed.tones ?? INITIAL_PRESET.tones,
          incomingPartials,
          incomingTimbre,
        )
        return {
          ...typed,
          presets: migratedPresets,
          activePresetId: resolvedActivePresetId,
          partials: incomingPartials,
          timbreBlend: incomingTimbre,
          tones: migratedTones,
          shine: normalizeShine(typed.shine),
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
          metronomeMuted: typed.metronomeMuted ?? false,
          harmonicTimbreEnabled: typed.harmonicTimbreEnabled ?? true,
          entryGlideEnabled: typed.entryGlideEnabled ?? true,
          entryGlideLowestCents: clamp(
            -(typed.entryGlideLowestCents ?? DEFAULT_ENTRY_GLIDE_LOWEST_CENTS),
            -50,
            50,
          ),
          entryGlideLowestSeconds: clamp(
            typed.entryGlideLowestSeconds ?? DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS,
            0,
            4,
          ),
          entryGlideHighestCents: clamp(
            -(typed.entryGlideHighestCents ?? DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS),
            -50,
            50,
          ),
          entryGlideHighestSeconds: clamp(
            typed.entryGlideHighestSeconds ?? DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS,
            0,
            4,
          ),
          globalOvertoneEditEnabled: typed.globalOvertoneEditEnabled ?? false,
          controlsLocked: typed.controlsLocked ?? false,
          btControlMode: typed.btControlMode === 'speaker' ? 'speaker' : 'pedal',
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
        harmonicTimbreEnabled: state.harmonicTimbreEnabled,
        entryGlideEnabled: state.entryGlideEnabled,
        entryGlideLowestCents: state.entryGlideLowestCents,
        entryGlideLowestSeconds: state.entryGlideLowestSeconds,
        entryGlideHighestCents: state.entryGlideHighestCents,
        entryGlideHighestSeconds: state.entryGlideHighestSeconds,
        globalOvertoneEditEnabled: state.globalOvertoneEditEnabled,
        tones: state.tones,
        partials: state.partials,
        shine: state.shine,
        metronomeEnabled: state.metronomeEnabled,
        metronomeBpm: state.metronomeBpm,
        metronomeVolumeDb: state.metronomeVolumeDb,
        metronomeMuted: state.metronomeMuted,
        controlsLocked: state.controlsLocked,
        btControlMode: state.btControlMode,
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
