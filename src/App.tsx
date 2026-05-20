import {
  AudioWaveform,
  BatteryMedium,
  ClipboardPaste,
  Copy,
  Download,
  Info,
  Menu,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  StepBack,
  StepForward,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { droneEngine } from './audio/DroneEngine'
import { analyzeWavOvertones } from './audio/overtoneAnalysis'
import type { DroneRuntimeConfig, PartialConfig, TimbreBlend, ToneConfig } from './audio/types'
import { MetronomeControls } from './components/MetronomeControls'
import { NoteSelector } from './components/NoteSelector'
import { OvertoneBars } from './components/OvertoneBars'
import { OvertoneToneNavControls } from './components/OvertoneToneNavControls'
import { OvertoneMidiPanel } from './components/OvertoneMidiPanel'
import { PartialEditor } from './components/PartialEditor'
import { PresetList } from './components/PresetList'
import { SectionCard } from './components/SectionCard'
import { SongLibraryMenu } from './components/SongLibraryMenu'
import { ToneMixer } from './components/ToneMixer'
import { TopControls } from './components/TopControls'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useOvertoneMidi } from './hooks/useOvertoneMidi'
import { NOTE_IDS, NOTE_LABELS, type NoteId } from './music/notes'
import { getFrequency } from './music/tuning'
import { createDefaultPartials, type Preset } from './presets/defaultPresets'
import { useDroneStore } from './store/useDroneStore'

type TabId = 'tone' | 'overtones' | 'presets' | 'metronome' | 'midi' | 'blank'

const TABS: { id: TabId; label: string }[] = [
  { id: 'tone', label: 'Tone' },
  { id: 'overtones', label: 'Overtones' },
  { id: 'presets', label: 'Presets' },
  { id: 'metronome', label: 'Click' },
  { id: 'blank', label: 'Blank' },
]
const APP_VERSION = '2.1'
const DRONE_TITLE_LONG_PRESS_TO_OVERTONES_MS = 800
/** ~Safari viewport, loogilised CSS px (mitte dünaamiline Dynamic Island / toolbar). */
const IPHONE_16_PRO_MAX_CSS_W = 440
const IPHONE_16_PRO_MAX_CSS_H = 956
const MAX_OVERTONE_HISTORY = 60
const SONG_MENU_TRIGGER_CLASS =
  'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-[#252332] px-3 py-2 text-sm text-white/90 transition hover:bg-[#2f2d3c]'
type OvertoneSnapshot = {
  partials: PartialConfig[]
  timbreBlend: TimbreBlend
}

function isToneStrictSolo(tones: ToneConfig[], noteId: NoteId): boolean {
  const selected = tones.find((tone) => tone.noteId === noteId)
  if (!selected?.enabled) {
    return false
  }
  return tones.every((tone) => (tone.noteId === noteId ? tone.enabled : !tone.enabled))
}

function sortTonesByNoteId(source: ToneConfig[]): ToneConfig[] {
  return [...source].sort(
    (left, right) => NOTE_IDS.indexOf(left.noteId) - NOTE_IDS.indexOf(right.noteId),
  )
}

function getOvertoneNavigationTones(
  tones: ToneConfig[],
  overtoneToneOptions: ToneConfig[],
  toneSoloRestore: Map<NoteId, boolean> | null,
): ToneConfig[] {
  if (toneSoloRestore !== null) {
    const preSoloActive = tones.filter((tone) => toneSoloRestore.get(tone.noteId) === true)
    return sortTonesByNoteId(preSoloActive)
  }
  return sortTonesByNoteId(overtoneToneOptions)
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('tone')
  const [selectedOvertoneNoteId, setSelectedOvertoneNoteId] = useState<NoteId>('d')
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }),
  )
  const upPressTimeoutRef = useRef<number | null>(null)
  const droneTitleLongPressTimerRef = useRef<number | null>(null)
  const droneTitleLongPressFiredRef = useRef(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const overtoneAnalyzeInputRef = useRef<HTMLInputElement | null>(null)
  const sideMenuRef = useRef<HTMLElement | null>(null)
  const mediaAnchorRef = useRef<HTMLAudioElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const overtoneUndoRef = useRef<Map<NoteId, OvertoneSnapshot[]>>(new Map())
  const overtoneRedoRef = useRef<Map<NoteId, OvertoneSnapshot[]>>(new Map())
  const overtoneClipboardRef = useRef<PartialConfig[] | null>(null)
  const timbreMorphHistoryActiveRef = useRef(false)
  const [toneSoloRestore, setToneSoloRestore] = useState<Map<NoteId, boolean> | null>(null)
  const [, setOvertoneHistoryVersion] = useState(0)
  const playing = useDroneStore((state) => state.playing)
  const activePresetId = useDroneStore((state) => state.activePresetId)
  const songName = useDroneStore((state) => state.songName)
  const songLibrary = useDroneStore((state) => state.songLibrary)
  const presets = useDroneStore((state) => state.presets)
  const tones = useDroneStore((state) => state.tones)
  const partials = useDroneStore((state) => state.partials)
  const tuningSystemId = useDroneStore((state) => state.tuningSystemId)
  const tonalCenter = useDroneStore((state) => state.tonalCenter)
  const referenceA4Hz = useDroneStore((state) => state.referenceA4Hz)
  const baseOctave = useDroneStore((state) => state.baseOctave)
  const timbreBlend = useDroneStore((state) => state.timbreBlend)
  const masterGainDb = useDroneStore((state) => state.masterGainDb)
  const metronomeEnabled = useDroneStore((state) => state.metronomeEnabled)
  const metronomeBpm = useDroneStore((state) => state.metronomeBpm)
  const metronomeVolumeDb = useDroneStore((state) => state.metronomeVolumeDb)

  const togglePlaying = useDroneStore((state) => state.togglePlaying)
  const setPlaying = useDroneStore((state) => state.setPlaying)
  const nudgeReferenceA4Hz = useDroneStore((state) => state.nudgeReferenceA4Hz)
  const nudgeBaseOctave = useDroneStore((state) => state.nudgeBaseOctave)
  const setTuningSystemId = useDroneStore((state) => state.setTuningSystemId)
  const setTonalCenter = useDroneStore((state) => state.setTonalCenter)
  const setMasterGainDb = useDroneStore((state) => state.setMasterGainDb)
  const toggleToneEnabled = useDroneStore((state) => state.toggleToneEnabled)
  const setToneGain = useDroneStore((state) => state.setToneGain)
  const setTonePan = useDroneStore((state) => state.setTonePan)
  const setTonePartials = useDroneStore((state) => state.setTonePartials)
  const setTonePartialEnabled = useDroneStore((state) => state.setTonePartialEnabled)
  const setTonePartialRatio = useDroneStore((state) => state.setTonePartialRatio)
  const setTonePartialGain = useDroneStore((state) => state.setTonePartialGain)
  const addTonePartial = useDroneStore((state) => state.addTonePartial)
  const removeTonePartial = useDroneStore((state) => state.removeTonePartial)
  const setTimbreValue = useDroneStore((state) => state.setTimbreValue)
  const setMetronomeEnabled = useDroneStore((state) => state.setMetronomeEnabled)
  const setMetronomeBpm = useDroneStore((state) => state.setMetronomeBpm)
  const setMetronomeVolumeDb = useDroneStore((state) => state.setMetronomeVolumeDb)
  const saveActivePreset = useDroneStore((state) => state.saveActivePreset)
  const saveAsPreset = useDroneStore((state) => state.saveAsPreset)
  const loadPreset = useDroneStore((state) => state.loadPreset)
  const renamePreset = useDroneStore((state) => state.renamePreset)
  const duplicatePreset = useDroneStore((state) => state.duplicatePreset)
  const deletePreset = useDroneStore((state) => state.deletePreset)
  const movePreset = useDroneStore((state) => state.movePreset)
  const importSong = useDroneStore((state) => state.importSong)
  const importSongLibrary = useDroneStore((state) => state.importSongLibrary)
  const loadSongFromLibrary = useDroneStore((state) => state.loadSongFromLibrary)
  const deleteSongFromLibrary = useDroneStore((state) => state.deleteSongFromLibrary)
  const moveSongInLibrary = useDroneStore((state) => state.moveSongInLibrary)
  const saveCurrentSongToLibrary = useDroneStore((state) => state.saveCurrentSongToLibrary)
  const selectNextPreset = useDroneStore((state) => state.selectNextPreset)
  const selectPreviousPreset = useDroneStore((state) => state.selectPreviousPreset)

  const selectedOvertoneTone = useMemo(
    () =>
      tones.find((tone) => tone.noteId === selectedOvertoneNoteId) ??
      tones.find((tone) => tone.enabled) ??
      tones[0],
    [selectedOvertoneNoteId, tones],
  )
  const selectedOvertonePartials = useMemo(
    () => selectedOvertoneTone?.partials ?? partials,
    [partials, selectedOvertoneTone],
  )
  const setSelectedOvertonePartials = useCallback(
    (nextPartials: PartialConfig[]) => setTonePartials(selectedOvertoneNoteId, nextPartials),
    [selectedOvertoneNoteId, setTonePartials],
  )
  const setSelectedOvertoneGain = useCallback(
    (partialId: string, gainDb: number) =>
      setTonePartialGain(selectedOvertoneNoteId, partialId, gainDb),
    [selectedOvertoneNoteId, setTonePartialGain],
  )
  const setSelectedOvertoneRatio = useCallback(
    (partialId: string, ratio: number) =>
      setTonePartialRatio(selectedOvertoneNoteId, partialId, ratio),
    [selectedOvertoneNoteId, setTonePartialRatio],
  )
  const setSelectedOvertoneEnabled = useCallback(
    (partialId: string, enabled: boolean) =>
      setTonePartialEnabled(selectedOvertoneNoteId, partialId, enabled),
    [selectedOvertoneNoteId, setTonePartialEnabled],
  )
  const addSelectedOvertonePartial = useCallback(
    () => addTonePartial(selectedOvertoneNoteId),
    [addTonePartial, selectedOvertoneNoteId],
  )
  const removeSelectedOvertonePartial = useCallback(
    (partialId: string) => removeTonePartial(selectedOvertoneNoteId, partialId),
    [removeTonePartial, selectedOvertoneNoteId],
  )

  const overtoneMidi = useOvertoneMidi({
    partials: selectedOvertonePartials,
    setPartialGain: setSelectedOvertoneGain,
    setPartialEnabled: setSelectedOvertoneEnabled,
  })

  const clonePartials = useCallback(
    (source: PartialConfig[]) => source.map((partial) => ({ ...partial })),
    [],
  )

  const cloneTimbreBlend = useCallback(
    (source: TimbreBlend): TimbreBlend => ({ ...source }),
    [],
  )

  const samePartials = useCallback((a: PartialConfig[], b: PartialConfig[]) => {
    if (a.length !== b.length) {
      return false
    }
    for (let index = 0; index < a.length; index += 1) {
      const left = a[index]
      const right = b[index]
      if (
        left.id !== right.id ||
        left.enabled !== right.enabled ||
        left.gainDb !== right.gainDb ||
        left.ratio !== right.ratio
      ) {
        return false
      }
    }
    return true
  }, [])

  const sameTimbreBlend = useCallback((a: TimbreBlend, b: TimbreBlend) => {
    return a.sine === b.sine && a.saw === b.saw && a.square === b.square
  }, [])

  const sameOvertoneSnapshot = useCallback(
    (a: OvertoneSnapshot, b: OvertoneSnapshot) =>
      samePartials(a.partials, b.partials) && sameTimbreBlend(a.timbreBlend, b.timbreBlend),
    [samePartials, sameTimbreBlend],
  )

  const getCurrentOvertoneSnapshot = useCallback((): OvertoneSnapshot => {
    const state = useDroneStore.getState()
    const selectedTone = state.tones.find((tone) => tone.noteId === selectedOvertoneNoteId)
    return {
      partials: clonePartials(selectedTone?.partials ?? selectedOvertonePartials),
      timbreBlend: cloneTimbreBlend(state.timbreBlend),
    }
  }, [clonePartials, cloneTimbreBlend, selectedOvertoneNoteId, selectedOvertonePartials])

  const applyOvertoneSnapshot = useCallback(
    (snapshot: OvertoneSnapshot) => {
      setSelectedOvertonePartials(clonePartials(snapshot.partials))
      setTimbreValue('sine', snapshot.timbreBlend.sine)
      setTimbreValue('saw', snapshot.timbreBlend.saw)
      setTimbreValue('square', snapshot.timbreBlend.square)
    },
    [clonePartials, setSelectedOvertonePartials, setTimbreValue],
  )

  const getOvertoneHistoryStack = useCallback(
    (history: Map<NoteId, OvertoneSnapshot[]>, noteId: NoteId): OvertoneSnapshot[] => {
      const existing = history.get(noteId)
      if (existing) {
        return existing
      }
      const next: OvertoneSnapshot[] = []
      history.set(noteId, next)
      return next
    },
    [],
  )

  const rememberOvertoneState = useCallback(() => {
    const snapshot = getCurrentOvertoneSnapshot()
    const undoStack = getOvertoneHistoryStack(overtoneUndoRef.current, selectedOvertoneNoteId)
    const currentTop = undoStack[undoStack.length - 1]
    if (currentTop && sameOvertoneSnapshot(currentTop, snapshot)) {
      return
    }
    undoStack.push(snapshot)
    if (undoStack.length > MAX_OVERTONE_HISTORY) {
      undoStack.shift()
    }
    overtoneRedoRef.current.set(selectedOvertoneNoteId, [])
    setOvertoneHistoryVersion((value) => value + 1)
  }, [getCurrentOvertoneSnapshot, getOvertoneHistoryStack, sameOvertoneSnapshot, selectedOvertoneNoteId])

  const undoOvertoneChange = useCallback(() => {
    const undoStack = getOvertoneHistoryStack(overtoneUndoRef.current, selectedOvertoneNoteId)
    const previous = undoStack.pop()
    if (!previous) {
      return
    }
    const redoStack = getOvertoneHistoryStack(overtoneRedoRef.current, selectedOvertoneNoteId)
    redoStack.push(getCurrentOvertoneSnapshot())
    applyOvertoneSnapshot(previous)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [applyOvertoneSnapshot, getCurrentOvertoneSnapshot, getOvertoneHistoryStack, selectedOvertoneNoteId])

  const redoOvertoneChange = useCallback(() => {
    const redoStack = getOvertoneHistoryStack(overtoneRedoRef.current, selectedOvertoneNoteId)
    const next = redoStack.pop()
    if (!next) {
      return
    }
    const undoStack = getOvertoneHistoryStack(overtoneUndoRef.current, selectedOvertoneNoteId)
    undoStack.push(getCurrentOvertoneSnapshot())
    applyOvertoneSnapshot(next)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [applyOvertoneSnapshot, getCurrentOvertoneSnapshot, getOvertoneHistoryStack, selectedOvertoneNoteId])

  const canUndoOvertones =
    (overtoneUndoRef.current.get(selectedOvertoneNoteId)?.length ?? 0) > 0
  const canRedoOvertones =
    (overtoneRedoRef.current.get(selectedOvertoneNoteId)?.length ?? 0) > 0
  const canPasteOvertones = overtoneClipboardRef.current !== null

  const beginTimbreMorphChange = useCallback(() => {
    if (timbreMorphHistoryActiveRef.current) {
      return
    }
    rememberOvertoneState()
    timbreMorphHistoryActiveRef.current = true
  }, [rememberOvertoneState])

  const endTimbreMorphChange = useCallback(() => {
    timbreMorphHistoryActiveRef.current = false
  }, [])

  const copySelectedOvertones = useCallback(() => {
    overtoneClipboardRef.current = clonePartials(selectedOvertonePartials)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [clonePartials, selectedOvertonePartials])

  const pasteSelectedOvertones = useCallback(() => {
    const copied = overtoneClipboardRef.current
    if (!copied) {
      return
    }
    rememberOvertoneState()
    setSelectedOvertonePartials(clonePartials(copied))
  }, [clonePartials, rememberOvertoneState, setSelectedOvertonePartials])

  const downloadJson = useCallback((payload: unknown, fileName: string) => {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [])

  const makeSafeFileName = useCallback((name: string, fallback: string) => {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || fallback
    )
  }, [])

  const exportCurrentSong = useCallback(() => {
    const inputName = window.prompt('Song name', songName) ?? ''
    const resolvedName = inputName.trim() || songName || 'My Song'
    const activePreset = presets.find((preset) => preset.id === activePresetId)
    const payload = {
      kind: 'bourdon-song',
      version: 1,
      name: resolvedName,
      activePresetId,
      activePresetName: activePreset?.name ?? null,
      presetCount: presets.length,
      presets,
      exportedAt: new Date().toISOString(),
    }
    downloadJson(payload, `${makeSafeFileName(resolvedName, 'song')}.song.json`)
  }, [activePresetId, downloadJson, makeSafeFileName, presets, songName])

  const exportSongLibrary = useCallback(() => {
    const inputName = window.prompt('Song library name', songName) ?? ''
    const libraryName = inputName.trim() || songName || 'My Song'
    const currentSongName = songName.trim() || 'Song 1'
    const activePreset = presets.find((preset) => preset.id === activePresetId)
    const currentSongSnapshot = {
      presets: presets.map((preset) => ({ ...preset })),
      activePresetId,
    }
    const currentSongIndex = songLibrary.findIndex((entry) => entry.name === songName)
    const exportedSongLibrary =
      currentSongIndex >= 0
        ? songLibrary.map((entry, index) =>
            index === currentSongIndex
              ? {
                  ...entry,
                  name: currentSongName,
                  ...currentSongSnapshot,
                }
              : entry,
          )
        : [
            ...songLibrary,
            {
              id: `song-export-${Date.now()}`,
              name: currentSongName,
              ...currentSongSnapshot,
            },
          ]
    const payload = {
      kind: 'bourdon-song-library',
      version: 2,
      name: libraryName,
      activeSongName: currentSongName,
      songCount: exportedSongLibrary.length,
      songLibrary: exportedSongLibrary,
      activePresetId,
      activePresetName: activePreset?.name ?? null,
      presetCount: presets.length,
      presets,
      exportedAt: new Date().toISOString(),
    }
    downloadJson(payload, `${makeSafeFileName(libraryName, 'song-library')}.song-library.json`)
  }, [activePresetId, downloadJson, makeSafeFileName, presets, songLibrary, songName])

  const importSongs = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (files.length === 0) {
        return
      }

      let importedCount = 0
      for (const file of files) {
        try {
          const content = await file.text()
          const parsed = JSON.parse(content) as {
            presets?: Preset[]
            activePresetId?: string
            name?: string
            songLibrary?: Array<{
              id?: string
              name?: string
              presets?: Preset[]
              activePresetId?: string
            }>
          }
          if (Array.isArray(parsed.songLibrary) && parsed.songLibrary.length > 0) {
            const importableSongs = parsed.songLibrary.filter(
              (song) => Array.isArray(song.presets) && song.presets.length > 0,
            )
            if (importableSongs.length === 0) {
              continue
            }
            importSongLibrary(importableSongs)
            importedCount += importableSongs.length
            continue
          }
          if (!Array.isArray(parsed.presets) || parsed.presets.length === 0) {
            continue
          }
          importSong(parsed.presets, parsed.activePresetId, parsed.name)
          importedCount += 1
        } catch {
          // Skip invalid files and continue with the rest.
        }
      }

      if (importedCount === 0) {
        window.alert('Could not import any selected song files.')
      }

      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    },
    [importSong, importSongLibrary],
  )

  const buildResetOvertoneBalance = useCallback((source: PartialConfig[]): PartialConfig[] => {
    const defaults = createDefaultPartials()
    return source.map((partial, index) => {
      const fallback = defaults[Math.min(index, defaults.length - 1)]
      if (!fallback) {
        return partial
      }
      return {
        ...partial,
        ratio: fallback.ratio,
        gainDb: fallback.gainDb,
        enabled: fallback.enabled,
      }
    })
  }, [])

  const resetOvertoneBalance = useCallback(() => {
    const current = selectedOvertonePartials
    const resetTarget = buildResetOvertoneBalance(current)
    if (samePartials(current, resetTarget)) {
      return
    }
    rememberOvertoneState()
    setSelectedOvertonePartials(resetTarget)
  }, [buildResetOvertoneBalance, rememberOvertoneState, samePartials, selectedOvertonePartials, setSelectedOvertonePartials])

  const canResetOvertones = useMemo(() => {
    const resetTarget = buildResetOvertoneBalance(selectedOvertonePartials)
    return !samePartials(selectedOvertonePartials, resetTarget)
  }, [buildResetOvertoneBalance, selectedOvertonePartials, samePartials])

  const analyzeOvertoneBalanceFromFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      try {
        const analysis = await analyzeWavOvertones(file, selectedOvertonePartials.length)
        const includeRatios = window.confirm(
          'Include overtone ratio analysis too? Press Cancel to update only balance (gain/mute).',
        )
        const presetNameFromFile = file.name.replace(/\.[^/.]+$/, '').trim() || 'Analyzed WAV'
        const current = selectedOvertonePartials
        const analyzed = current.map((partial, index) => {
          const gainDb = analysis.gainsDb[index] ?? -48
          return {
            ...partial,
            ratio: includeRatios ? (analysis.ratios[index] ?? partial.ratio) : partial.ratio,
            gainDb,
            enabled: gainDb > -47.5,
          }
        })
        setSelectedOvertonePartials(analyzed)
        saveAsPreset()
        const nextActivePresetId = useDroneStore.getState().activePresetId
        renamePreset(nextActivePresetId, presetNameFromFile)
      } catch {
        window.alert('Could not analyze overtone balance from this audio file.')
      } finally {
        if (overtoneAnalyzeInputRef.current) {
          overtoneAnalyzeInputRef.current.value = ''
        }
      }
    },
    [renamePreset, saveAsPreset, selectedOvertonePartials, setSelectedOvertonePartials],
  )

  const openJblPortableApp = useCallback(() => {
    // Best effort deep-link. Works only if JBL registers this URL scheme.
    window.location.href = 'jblportable://'
  }, [])
  const saveAsSong = useCallback(() => {
    const inputName = window.prompt('Song name', `${songName} copy`)
    if (inputName === null) {
      return
    }
    const trimmedName = inputName.trim()
    if (!trimmedName) {
      return
    }
    saveCurrentSongToLibrary(trimmedName)
  }, [saveCurrentSongToLibrary, songName])

  const handleTogglePlay = useCallback(() => {
    const currentlyPlaying = useDroneStore.getState().playing
    if (!currentlyPlaying) {
      // Must run synchronously inside the user-gesture call stack so Safari
      // honours AudioContext.resume().
      droneEngine.ensureRunning(latestRuntimeConfigRef.current)
    }
    togglePlaying()
  }, [togglePlaying])

  const activeTones = useMemo(() => tones.filter((tone) => tone.enabled), [tones])
  const overtoneToneOptions = activeTones.length > 0 ? activeTones : tones
  const isSelectedOvertoneToneSolo = useMemo(
    () => isToneStrictSolo(tones, selectedOvertoneNoteId),
    [tones, selectedOvertoneNoteId],
  )
  const overtoneNavigationTones = useMemo(
    () =>
      getOvertoneNavigationTones(tones, overtoneToneOptions, toneSoloRestore),
    [tones, overtoneToneOptions, toneSoloRestore],
  )
  const canNavigateOvertoneTone = overtoneNavigationTones.length > 1
  const selectedOvertoneToneLabel = selectedOvertoneTone
    ? NOTE_LABELS[selectedOvertoneTone.noteId]
    : 'Tone'
  const selectedOvertoneToneSoloAriaLabel = `Lülita tooni solo: ${selectedOvertoneToneLabel}`
  const applyToneEnabledMap = useCallback((enabledByNoteId: Map<NoteId, boolean>) => {
    useDroneStore.setState((state) => ({
      tones: state.tones.map((tone) => {
        const nextEnabled = enabledByNoteId.get(tone.noteId)
        if (typeof nextEnabled !== 'boolean' || nextEnabled === tone.enabled) {
          return tone
        }
        return { ...tone, enabled: nextEnabled }
      }),
    }))
  }, [])
  const restoreToneSoloState = useCallback(() => {
    if (!toneSoloRestore) {
      return false
    }
    applyToneEnabledMap(toneSoloRestore)
    setToneSoloRestore(null)
    return true
  }, [applyToneEnabledMap, toneSoloRestore])
  const enterToneSoloForNote = useCallback(
    (noteId: NoteId) => {
      const currentTones = useDroneStore.getState().tones
      const targetTone = currentTones.find((tone) => tone.noteId === noteId)
      if (!targetTone) {
        return
      }
      const restoreState = new Map<NoteId, boolean>()
      const soloState = new Map<NoteId, boolean>()
      currentTones.forEach((tone) => {
        restoreState.set(tone.noteId, tone.enabled)
        soloState.set(tone.noteId, tone.noteId === noteId)
      })
      setToneSoloRestore(restoreState)
      applyToneEnabledMap(soloState)
    },
    [applyToneEnabledMap],
  )
  const toggleToneSoloForNote = useCallback(
    (noteId: NoteId) => {
      const currentTones = useDroneStore.getState().tones
      const selectedTone = currentTones.find((tone) => tone.noteId === noteId)
      const selectedIsSolo =
        Boolean(selectedTone?.enabled) &&
        currentTones.every((tone) => (tone.noteId === noteId ? tone.enabled : !tone.enabled))
      if (selectedIsSolo && restoreToneSoloState()) {
        return
      }
      enterToneSoloForNote(noteId)
    },
    [enterToneSoloForNote, restoreToneSoloState],
  )
  const toggleSelectedOvertoneToneSolo = useCallback(() => {
    toggleToneSoloForNote(selectedOvertoneNoteId)
  }, [toggleToneSoloForNote, selectedOvertoneNoteId])
  const selectAdjacentOvertoneTone = useCallback(
    (direction: 'previous' | 'next') => {
      const currentTones = useDroneStore.getState().tones
      const activeTonesNow = currentTones.filter((tone) => tone.enabled)
      const toneOptionsNow = activeTonesNow.length > 0 ? activeTonesNow : currentTones
      const navigationTones = getOvertoneNavigationTones(
        currentTones,
        toneOptionsNow,
        toneSoloRestore,
      )
      if (navigationTones.length === 0) {
        return
      }
      const currentIndex = navigationTones.findIndex((tone) => tone.noteId === selectedOvertoneNoteId)
      const fallbackIndex = currentIndex >= 0 ? currentIndex : 0
      const delta = direction === 'previous' ? -1 : 1
      const nextIndex = (fallbackIndex + delta + navigationTones.length) % navigationTones.length
      const nextNoteId = navigationTones[nextIndex].noteId
      setSelectedOvertoneNoteId(nextNoteId)
      if (toneSoloRestore !== null || isToneStrictSolo(currentTones, selectedOvertoneNoteId)) {
        const soloState = new Map<NoteId, boolean>()
        currentTones.forEach((tone) => {
          soloState.set(tone.noteId, tone.noteId === nextNoteId)
        })
        applyToneEnabledMap(soloState)
      }
    },
    [applyToneEnabledMap, selectedOvertoneNoteId, toneSoloRestore],
  )
  const partialReferenceFrequencyHz = useMemo(() => {
    const sourceTone = selectedOvertoneTone ?? activeTones[0] ?? tones[0]
    if (!sourceTone) {
      return null
    }
    return getFrequency(
      sourceTone.noteId,
      tuningSystemId,
      tonalCenter,
      referenceA4Hz,
      baseOctave,
    )
  }, [activeTones, baseOctave, referenceA4Hz, selectedOvertoneTone, tonalCenter, tones, tuningSystemId])
  const runtimeConfig = useMemo<DroneRuntimeConfig>(
    () => ({
      referenceA4Hz,
      baseOctave,
      tuningSystemId,
      tonalCenter,
      masterGainDb,
      timbreBlend,
      tones,
      partials,
    }),
    [referenceA4Hz, baseOctave, tuningSystemId, tonalCenter, masterGainDb, timbreBlend, tones, partials],
  )

  const latestRuntimeConfigRef = useRef<DroneRuntimeConfig>(runtimeConfig)
  useEffect(() => {
    latestRuntimeConfigRef.current = runtimeConfig
  }, [runtimeConfig])

  useEffect(() => {
    if (!tones.some((tone) => tone.noteId === selectedOvertoneNoteId)) {
      const fallback = tones.find((tone) => tone.enabled) ?? tones[0]
      if (fallback) {
        setSelectedOvertoneNoteId(fallback.noteId)
      }
    }
  }, [selectedOvertoneNoteId, tones])

  useEffect(() => {
    overtoneUndoRef.current = new Map()
    overtoneRedoRef.current = new Map()
    setOvertoneHistoryVersion((value) => value + 1)
  }, [activePresetId])

  useAudioEngine(runtimeConfig, playing)
  useMetronome({
    enabled: metronomeEnabled,
    bpm: metronomeBpm,
    volumeDb: metronomeVolumeDb,
  })

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    const setActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // iOS Safari can reject unsupported handlers; keep play/pause working.
      }
    }

    setActionHandler('play', () => {
      droneEngine.ensureRunning(latestRuntimeConfigRef.current)
      useDroneStore.getState().setPlaying(true)
    })
    setActionHandler('pause', () => {
      useDroneStore.getState().setPlaying(false)
    })
    setActionHandler('nexttrack', () => {
      useDroneStore.getState().selectNextPreset()
    })
    setActionHandler('previoustrack', () => {
      useDroneStore.getState().selectPreviousPreset()
    })

    return () => {
      setActionHandler('play', null)
      setActionHandler('pause', null)
      setActionHandler('nexttrack', null)
      setActionHandler('previoustrack', null)
    }
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    } catch {
      // Ignore browsers that reject the write.
    }
  }, [playing])

  // Show the currently selected preset name on the iOS lock screen.
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }
    const activePresetName =
      presets.find((preset) => preset.id === activePresetId)?.name ?? 'Drone'
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activePresetName,
        artist: songName || 'Drone',
        album: 'Drone App',
      })
    } catch {
      // Some browsers reject MediaMetadata before user gesture; ignore.
    }
  }, [activePresetId, presets, songName])

  // iOS PWA needs an actively playing media element for the OS to route
  // Bluetooth controls to our MediaSession handlers. We keep a silent
  // looping <audio> primed and play it in lock-step with the synth so iOS
  // sees an accurate playing/paused state and dispatches the right action
  // (play vs. pause) when a Bluetooth button is pressed.
  useEffect(() => {
    const sampleRate = 8000
    const numSamples = sampleRate
    const buffer = new ArrayBuffer(44 + numSamples * 2)
    const view = new DataView(buffer)
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + numSamples * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, numSamples * 2, true)

    const silentBlob = new Blob([buffer], { type: 'audio/wav' })
    const silentUrl = URL.createObjectURL(silentBlob)

    const anchor = document.createElement('audio')
    anchor.src = silentUrl
    anchor.loop = true
    anchor.preload = 'auto'
    anchor.setAttribute('playsinline', '')
    anchor.setAttribute('webkit-playsinline', '')
    anchor.muted = false
    anchor.volume = 1
    mediaAnchorRef.current = anchor

    const primeAnchor = () => {
      // Touch the element on a user gesture so iOS unlocks future play()
      // calls, but only keep it actively playing when the synth is too.
      if (!useDroneStore.getState().playing) {
        void anchor.play().then(() => anchor.pause()).catch(() => {
          // iOS can reject before a user gesture; later gestures retry.
        })
      }
    }

    window.addEventListener('pointerdown', primeAnchor, { passive: true })
    window.addEventListener('keydown', primeAnchor)
    window.addEventListener('touchend', primeAnchor, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', primeAnchor)
      window.removeEventListener('keydown', primeAnchor)
      window.removeEventListener('touchend', primeAnchor)
      anchor.pause()
      anchor.removeAttribute('src')
      anchor.load()
      URL.revokeObjectURL(silentUrl)
      mediaAnchorRef.current = null
    }
  }, [])

  // Mirror the Drone playing state onto the silent anchor so iOS reports
  // the correct playbackState to the lock-screen and Bluetooth controllers.
  useEffect(() => {
    const anchor = mediaAnchorRef.current
    if (!anchor) {
      return
    }
    if (playing) {
      if (anchor.paused) {
        void anchor.play().catch(() => {
          // iOS sometimes rejects play() outside a gesture; not fatal.
        })
      }
    } else if (!anchor.paused) {
      anchor.pause()
    }
  }, [playing])

  useEffect(() => {
    const navigatorWithAudioSession = navigator as Navigator & {
      audioSession?: { type: string }
    }
    const audioSession = navigatorWithAudioSession.audioSession
    if (!audioSession) {
      return
    }

    const previousType = audioSession.type
    try {
      audioSession.type = 'playback'
    } catch {
      return
    }

    return () => {
      try {
        audioSession.type = previousType
      } catch {
        // Ignore browsers that expose the API but reject writes.
      }
    }
  }, [])

  useEffect(() => {
    const TURN_DOWN_KEYS = new Set([
      'ArrowDown',
      'NumpadSubtract',
      'Minus',
      'PageDown',
      'AudioVolumeDown',
      'VolumeDown',
      'MediaTrackPrevious',
    ])
    const TURN_UP_KEYS = new Set([
      'ArrowUp',
      'NumpadAdd',
      'Equal',
      'PageUp',
      'AudioVolumeUp',
      'VolumeUp',
      'MediaTrackNext',
    ])
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      if (isTypingTarget) {
        return
      }
      const mediaKey = event.key || event.code
      const isTurnDownKey = TURN_DOWN_KEYS.has(mediaKey)
      const isTurnUpKey = TURN_UP_KEYS.has(mediaKey)

      if (isTurnDownKey) {
        event.preventDefault()
        const wasPlaying = useDroneStore.getState().playing
        if (!wasPlaying) {
          droneEngine.ensureRunning(latestRuntimeConfigRef.current)
        }
        togglePlaying()
        return
      }

      if (isTurnUpKey) {
        event.preventDefault()
        if (upPressTimeoutRef.current !== null) {
          window.clearTimeout(upPressTimeoutRef.current)
          upPressTimeoutRef.current = null
          selectPreviousPreset()
          return
        }
        upPressTimeoutRef.current = window.setTimeout(() => {
          selectNextPreset()
          upPressTimeoutRef.current = null
        }, 260)
        return
      }

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        const wasPlaying = useDroneStore.getState().playing
        if (!wasPlaying) {
          droneEngine.ensureRunning(latestRuntimeConfigRef.current)
        }
        togglePlaying()
        return
      }
      if (mediaKey === 'MediaPlayPause') {
        event.preventDefault()
        const wasPlaying = useDroneStore.getState().playing
        if (!wasPlaying) {
          droneEngine.ensureRunning(latestRuntimeConfigRef.current)
        }
        togglePlaying()
        return
      }
      if (mediaKey === 'MediaPlay') {
        event.preventDefault()
        droneEngine.fastResume(latestRuntimeConfigRef.current)
        setPlaying(true)
        return
      }
      if (mediaKey === 'MediaPause') {
        event.preventDefault()
        setPlaying(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      if (upPressTimeoutRef.current !== null) {
        window.clearTimeout(upPressTimeoutRef.current)
        upPressTimeoutRef.current = null
      }
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectNextPreset, selectPreviousPreset, setPlaying, togglePlaying])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (activeTab !== 'overtones') {
      return
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' })
      previewScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    })
  }, [activeTab])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const closeMenuOnOutsidePointer = (event: PointerEvent) => {
      const menuElement = sideMenuRef.current
      if (!menuElement) {
        return
      }
      const target = event.target
      if (target instanceof Node && !menuElement.contains(target)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeMenuOnOutsidePointer)
    return () => {
      window.removeEventListener('pointerdown', closeMenuOnOutsidePointer)
    }
  }, [menuOpen])

  const menuLabel = menuOpen ? 'Close menu' : 'Open menu'
  const clearDroneTitleLongPressTimer = useCallback(() => {
    if (droneTitleLongPressTimerRef.current !== null) {
      window.clearTimeout(droneTitleLongPressTimerRef.current)
      droneTitleLongPressTimerRef.current = null
    }
  }, [])
  const iphone16ProMaxPreview = useMemo(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('device') === 'iphone16pm',
    [],
  )
  const appShell = (
    <div
      className={`relative ${
        iphone16ProMaxPreview ? 'min-h-full min-w-0' : 'min-h-screen'
      } bg-[#111019] text-[#f2f2f7] ${activeTab === 'metronome' ? 'h-screen overflow-hidden' : ''}`}
    >
      <div className="mx-auto w-full max-w-md px-3 py-5 landscape:max-w-none max-h-[500px]:max-w-none md:max-w-5xl">
        <header className="sticky top-2 z-40 mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#111019]/90 px-3 py-2 backdrop-blur-sm landscape:hidden max-h-[500px]:hidden">
          {activeTab !== 'blank' && (
            <button
              type="button"
              aria-label={menuLabel}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-white/80"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}
          <button
            type="button"
            className="select-none rounded-lg px-1 py-1 text-xl font-semibold tracking-wide text-white transition hover:bg-white/10"
            onPointerDown={() => {
              droneTitleLongPressFiredRef.current = false
              clearDroneTitleLongPressTimer()
              droneTitleLongPressTimerRef.current = window.setTimeout(() => {
                droneTitleLongPressTimerRef.current = null
                droneTitleLongPressFiredRef.current = true
                setActiveTab('overtones')
              }, DRONE_TITLE_LONG_PRESS_TO_OVERTONES_MS)
            }}
            onPointerUp={clearDroneTitleLongPressTimer}
            onPointerLeave={clearDroneTitleLongPressTimer}
            onPointerCancel={clearDroneTitleLongPressTimer}
            onClick={() => {
              if (droneTitleLongPressFiredRef.current) {
                droneTitleLongPressFiredRef.current = false
                return
              }
              setActiveTab('tone')
            }}
            aria-label="Open Tone home. Long-press to open Overtone balance."
          >
            Drone 2
          </button>
          <div className="ml-auto text-4xl font-extrabold leading-none text-fuchsia-100">{currentTime}</div>
        </header>

        <main
          className={`landscape:pb-2 max-h-[500px]:pb-2 ${
            activeTab === 'blank' ? 'pb-20' : activeTab === 'metronome' ? 'pb-32' : 'pb-44'
          }`}
        >
          <div className="space-y-3" role="tabpanel" id="panel-tone" aria-labelledby="tab-tone" hidden={activeTab !== 'tone'}>
            <div className="sticky top-[68px] z-20 -mx-3 grid grid-cols-2 gap-2 overflow-visible bg-[#111019] px-3 landscape:top-2 max-h-[500px]:top-2">
              <article className="relative rounded-xl border border-fuchsia-300/45 bg-[#211a2d] p-3">
                <button
                  type="button"
                  className="absolute inset-0 rounded-xl transition hover:bg-fuchsia-300/10"
                  onClick={() => setActiveTab('presets')}
                  aria-label="Open presets"
                />
                <div className="pointer-events-none relative min-w-0">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                    Preset
                  </h2>
                  <p className="mt-5 truncate rounded-md border border-fuchsia-300/50 bg-fuchsia-300/20 px-2 py-1 text-sm font-extrabold text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)]">
                    {presets.find((preset) => preset.id === activePresetId)?.name ?? 'Preset'}
                  </p>
                </div>
                <div className="absolute right-2 top-2 z-10 flex gap-1">
                  <button
                    type="button"
                    className="button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
                    onClick={saveActivePreset}
                    aria-label="Save current preset"
                  >
                    <Save size={15} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
                    onClick={saveAsPreset}
                    aria-label="Save as new preset"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </article>
              <article className="relative min-w-0 overflow-visible rounded-xl border border-white/10 bg-[#1a1825] p-3">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                  Song
                </h2>
                <div className="absolute right-2 top-2 z-10 flex gap-1">
                  <button
                    type="button"
                    className="button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
                    onClick={() => saveCurrentSongToLibrary()}
                    aria-label="Save current song"
                  >
                    <Save size={15} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
                    onClick={saveAsSong}
                    aria-label="Save as new song"
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <SongLibraryMenu
                  songName={songName}
                  songLibrary={songLibrary}
                  onSaveCurrentSong={saveCurrentSongToLibrary}
                  onLoadSong={loadSongFromLibrary}
                  onMoveSong={moveSongInLibrary}
                  onDeleteSong={deleteSongFromLibrary}
                  triggerClassName="mt-5 flex min-h-0 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-sm font-semibold text-white/95 transition hover:bg-white/15"
                />
              </article>
            </div>
            <SectionCard title="Global controls" className="[&>header]:mb-1">
              <div className="space-y-5">
                <TopControls
                  referenceA4Hz={referenceA4Hz}
                  baseOctave={baseOctave}
                  tuningSystemId={tuningSystemId}
                  tonalCenter={tonalCenter}
                  onReferenceNudge={nudgeReferenceA4Hz}
                  onBaseOctaveNudge={nudgeBaseOctave}
                  onTuningSystemChange={setTuningSystemId}
                  onTonalCenterChange={setTonalCenter}
                />
                <NoteSelector tones={tones} onToggleTone={(noteId: NoteId) => toggleToneEnabled(noteId)} />
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.16em] text-white/60">Master gain</span>
                    <span className="text-xs tabular-nums text-white/70">{masterGainDb.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={0}
                    step={0.1}
                    value={masterGainDb}
                    onChange={(event) => setMasterGainDb(Number(event.target.value))}
                    className="h-1.5 w-full accent-fuchsia-300"
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Tone mixer">
              <ToneMixer
                tones={activeTones}
                allTones={tones}
                onToneGain={setToneGain}
                onTonePan={setTonePan}
                onToggleToneSolo={toggleToneSoloForNote}
                onEditOvertones={(noteId) => {
                  setSelectedOvertoneNoteId(noteId)
                  setActiveTab('overtones')
                }}
              />
            </SectionCard>
          </div>
          <div
            className="space-y-4 landscape:space-y-2 max-h-[500px]:space-y-2"
            role="tabpanel"
            id="panel-overtones"
            aria-labelledby="tab-overtones"
            hidden={activeTab !== 'overtones'}
          >
            <SectionCard
              title="Overtones"
              className="landscape:p-2 landscape:[&>header]:hidden max-h-[500px]:p-2 max-h-[500px]:[&>header]:hidden [&>header]:mb-2"
              rightSlot={
                <div className="flex w-full min-w-0 flex-col items-end gap-1.5 landscape:hidden max-h-[500px]:hidden">
                  <OvertoneToneNavControls
                    variant="portrait-solo"
                    toneLabel={selectedOvertoneToneLabel}
                    isSolo={isSelectedOvertoneToneSolo}
                    canNavigate={canNavigateOvertoneTone}
                    soloAriaLabel={selectedOvertoneToneSoloAriaLabel}
                    onToggleSolo={toggleSelectedOvertoneToneSolo}
                    onPrevious={() => selectAdjacentOvertoneTone('previous')}
                    onNext={() => selectAdjacentOvertoneTone('next')}
                  />
                  <div className="hide-scrollbar -mx-0.5 flex overflow-x-auto">
                    <div className="flex min-w-full items-center justify-between gap-9 px-0.5">
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="button-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                          onClick={saveActivePreset}
                          aria-label="Save current preset"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          type="button"
                          className="button-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                          onClick={resetOvertoneBalance}
                          aria-label="Reset overtone balance"
                          disabled={!canResetOvertones}
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          type="button"
                          className="button-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                          onClick={undoOvertoneChange}
                          aria-label="Undo overtone change"
                          disabled={!canUndoOvertones}
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="button-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                          onClick={redoOvertoneChange}
                          aria-label="Redo overtone change"
                          disabled={!canRedoOvertones}
                        >
                          <Redo2 size={16} />
                        </button>
                      </div>
                      <OvertoneToneNavControls
                        variant="portrait-steps"
                        toneLabel={selectedOvertoneToneLabel}
                        isSolo={isSelectedOvertoneToneSolo}
                        canNavigate={canNavigateOvertoneTone}
                        soloAriaLabel={selectedOvertoneToneSoloAriaLabel}
                        onToggleSolo={toggleSelectedOvertoneToneSolo}
                        onPrevious={() => selectAdjacentOvertoneTone('previous')}
                        onNext={() => selectAdjacentOvertoneTone('next')}
                      />
                    </div>
                  </div>
                </div>
              }
            >
              <OvertoneBars
                partials={selectedOvertonePartials}
                timbreBlend={timbreBlend}
                onGainChange={overtoneMidi.onPartialGainFromUi}
                onGainDragStart={rememberOvertoneState}
                onToggleEnabled={(partialId, enabled) => {
                  rememberOvertoneState()
                  overtoneMidi.onPartialEnabledFromUi(partialId, enabled)
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-2 landscape:hidden max-h-[500px]:hidden">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                    onClick={copySelectedOvertones}
                    aria-label="Copy tone overtones"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={pasteSelectedOvertones}
                    aria-label="Paste tone overtones"
                    disabled={!canPasteOvertones}
                  >
                    <ClipboardPaste size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  className="button-safe flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
                  onClick={() => overtoneAnalyzeInputRef.current?.click()}
                  aria-label="Choose audio file for overtone analysis"
                >
                  <AudioWaveform size={16} />
                  Analyse audio
                </button>
              </div>
            </SectionCard>
            <SectionCard title="Partials & timbre">
              <PartialEditor
                partials={selectedOvertonePartials}
                referenceFrequencyHz={partialReferenceFrequencyHz}
                timbreBlend={timbreBlend}
                onSetPartialEnabled={overtoneMidi.onPartialEnabledFromUi}
                onSetPartialRatio={setSelectedOvertoneRatio}
                onSetPartialGain={overtoneMidi.onPartialGainFromUi}
                onAddPartial={addSelectedOvertonePartial}
                onRemovePartial={removeSelectedOvertonePartial}
                onSetTimbreValue={setTimbreValue}
                onTimbreChangeStart={beginTimbreMorphChange}
                onTimbreChangeEnd={endTimbreMorphChange}
              />
            </SectionCard>
          </div>
          <div className="space-y-4" role="tabpanel" id="panel-metronome" aria-labelledby="tab-metronome" hidden={activeTab !== 'metronome'}>
            <SectionCard title="Click" className="px-3 pb-3 pt-1.5 [&>header]:mb-0">
              <MetronomeControls
                enabled={metronomeEnabled}
                bpm={metronomeBpm}
                volumeDb={metronomeVolumeDb}
                onEnabledChange={setMetronomeEnabled}
                onBpmChange={setMetronomeBpm}
                onVolumeChange={setMetronomeVolumeDb}
              />
            </SectionCard>
          </div>
          <div className="space-y-4" role="tabpanel" id="panel-presets" aria-labelledby="tab-presets" hidden={activeTab !== 'presets'}>
            <SectionCard
              title="Presets"
              rightSlot={
                <SongLibraryMenu
                  songName={songName}
                  songLibrary={songLibrary}
                  onSaveCurrentSong={saveCurrentSongToLibrary}
                  onLoadSong={loadSongFromLibrary}
                  onMoveSong={moveSongInLibrary}
                  onDeleteSong={deleteSongFromLibrary}
                  triggerClassName={`${SONG_MENU_TRIGGER_CLASS} w-auto max-w-full px-4`}
                  dropdownPlacement="anchor"
                />
              }
            >
              <PresetList
                presets={presets}
                activePresetId={activePresetId}
                onLoadPreset={(presetId) => {
                  loadPreset(presetId)
                }}
                onRenamePreset={renamePreset}
                onDuplicatePreset={duplicatePreset}
                onDeletePreset={deletePreset}
                onMovePreset={movePreset}
              />
            </SectionCard>
          </div>
          <div className="space-y-4" role="tabpanel" id="panel-midi" aria-labelledby="tab-midi" hidden={activeTab !== 'midi'}>
            <OvertoneMidiPanel
              webMidiSupported={overtoneMidi.webMidiSupported}
              accessError={overtoneMidi.accessError}
              settings={overtoneMidi.settings}
              setEnabled={overtoneMidi.setEnabled}
              setChannel={overtoneMidi.setChannel}
              setInputId={overtoneMidi.setInputId}
              setOutputId={overtoneMidi.setOutputId}
              retryMidiAccess={overtoneMidi.retryMidiAccess}
              sendSnapshot={overtoneMidi.sendSnapshot}
              inputOptions={overtoneMidi.inputOptions}
              outputOptions={overtoneMidi.outputOptions}
            />
          </div>
          <div className="space-y-4" role="tabpanel" id="panel-blank" aria-labelledby="tab-blank" hidden={activeTab !== 'blank'} />
        </main>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#111019] px-3 pb-2">
        <div className="mx-auto w-full max-w-md space-y-0 landscape:max-w-none max-h-[500px]:max-w-none md:max-w-5xl">
          <nav
            className="overflow-x-auto rounded-xl border border-white/10 bg-[#111019]/95 p-1 backdrop-blur-sm"
            aria-label="App sections"
          >
            <div className="flex min-w-max items-center gap-1">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  aria-controls={`panel-${id}`}
                  id={`tab-${id}`}
                  className={`button-safe shrink-0 rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${activeTab === id ? 'border-white/25 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                </button>
              ))}
              {activeTab === 'overtones' && (
                <div className="ml-2 hidden shrink-0 items-center gap-1.5 landscape:flex max-h-[500px]:flex">
                  <OvertoneToneNavControls
                    variant="landscape-inline"
                    toneLabel={selectedOvertoneToneLabel}
                    isSolo={isSelectedOvertoneToneSolo}
                    canNavigate={canNavigateOvertoneTone}
                    soloAriaLabel={selectedOvertoneToneSoloAriaLabel}
                    onToggleSolo={toggleSelectedOvertoneToneSolo}
                    onPrevious={() => selectAdjacentOvertoneTone('previous')}
                    onNext={() => selectAdjacentOvertoneTone('next')}
                  />
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                    onClick={saveActivePreset}
                    aria-label="Save current preset"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={resetOvertoneBalance}
                    aria-label="Reset overtone balance"
                    disabled={!canResetOvertones}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={undoOvertoneChange}
                    aria-label="Undo overtone change"
                    disabled={!canUndoOvertones}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="button-safe flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                    onClick={redoOvertoneChange}
                    aria-label="Redo overtone change"
                    disabled={!canRedoOvertones}
                  >
                    <Redo2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </nav>
          {activeTab !== 'blank' && (
            <div className="rounded-xl border border-white/10 bg-[#111019]/95 p-2 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="button-safe flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 py-3 text-white transition hover:bg-white/10"
                  onClick={selectPreviousPreset}
                  aria-label="Previous preset"
                >
                  <StepBack size={22} />
                </button>
                <button
                  type="button"
                  className="button-safe flex min-h-[44px] min-w-0 flex-nowrap items-center justify-center gap-2 overflow-hidden rounded-xl border border-fuchsia-300/60 bg-fuchsia-400/15 px-2 py-3 text-center font-semibold text-white transition hover:bg-fuchsia-300/25"
                  onClick={handleTogglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {(playing && <Pause size={22} />) || <Play size={22} />}
                  <span className="inline-block w-14 text-center whitespace-nowrap">
                    {playing ? 'Pause' : 'Play'}
                  </span>
                </button>
                <button
                  type="button"
                  className="button-safe flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 py-3 text-white transition hover:bg-white/10"
                  onClick={selectNextPreset}
                  aria-label="Next preset"
                >
                  <StepForward size={22} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {(menuOpen) && (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            ref={sideMenuRef}
            className="fixed left-0 top-0 z-50 h-full w-[280px] border-r border-white/10 bg-[#1a1825] p-4 shadow-2xl"
            onClick={(event) => {
              const target = event.target as HTMLElement | null
              const interactiveAncestor = target?.closest(
                'button, a, input, select, textarea, [role="button"], [data-keep-menu-open]',
              )
              if (!interactiveAncestor) {
                setMenuOpen(false)
              }
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Menu</h2>
              <button
                type="button"
                aria-label="Close menu"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/80"
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => {
                  saveAsPreset()
                  setMenuOpen(false)
                }}
              >
                <Save size={20} />
                Save as new preset
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => {
                  importInputRef.current?.click()
                  setMenuOpen(false)
                }}
              >
                <Download size={20} />
                Import song / library
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => {
                  exportSongLibrary()
                  setMenuOpen(false)
                }}
              >
                <Upload size={20} />
                Export song library
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => {
                  exportCurrentSong()
                  setMenuOpen(false)
                }}
              >
                <Upload size={20} />
                Export song
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={openJblPortableApp}
              >
                <BatteryMedium size={20} />
                Open JBL Portable
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => {
                  setActiveTab('midi')
                  setMenuOpen(false)
                }}
              >
                <Menu size={20} />
                MIDI
              </button>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/70">
                <div className="mb-1 flex items-center gap-2 text-white/80">
                  <Info size={14} />
                  Drone v{APP_VERSION}
                </div>
                <p>Professional drone reference for tuning and intonation practice.</p>
                <p className="mt-2 text-xs text-white/55">(c) Margo Kõlar</p>
              </div>
            </div>
          </aside>
        </>
      )}
      <input
        ref={importInputRef}
        type="file"
        multiple
        accept=".json,.song.json,application/json"
        className="hidden"
        onChange={(event) => {
          void importSongs(event)
        }}
      />
      <input
        ref={overtoneAnalyzeInputRef}
        type="file"
        accept=".wav,.m4a,audio/wav,audio/x-wav,audio/mp4,audio/aac"
        className="hidden"
        onChange={(event) => {
          void analyzeOvertoneBalanceFromFile(event)
        }}
      />
    </div>
  )

  if (!iphone16ProMaxPreview) {
    return appShell
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0c0c0f] px-3 py-5 text-[#f2f2f7]">
      <p className="mb-3 max-w-md text-center text-[10px] leading-relaxed text-white/50">
        iPhone 16 Pro Max · {IPHONE_16_PRO_MAX_CSS_W}×{IPHONE_16_PRO_MAX_CSS_H} CSS px. Normaalse täisekraani jaoks
        eemalda{' '}
        <code className="rounded bg-white/10 px-1 font-mono text-[10px] text-fuchsia-300/90">device=iphone16pm</code>{' '}
        URL-ist.
      </p>
      <div
        className="relative overflow-hidden rounded-[2.8rem] border-[11px] border-[#3a3839] bg-black shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        style={{
          width: IPHONE_16_PRO_MAX_CSS_W,
          height: `min(${IPHONE_16_PRO_MAX_CSS_H}px, calc(100vh - 7rem))`,
          maxWidth: '100vw',
        }}
      >
        <div
          ref={previewScrollRef}
          className="relative h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          {appShell}
        </div>
      </div>
    </div>
  )
}

export default App
