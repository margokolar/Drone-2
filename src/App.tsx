import {
  ArrowDownUp,
  AudioWaveform,
  BatteryMedium,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Globe,
  Info,
  Menu,
  Pause,
  Play,
  PowerOff,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { metronomeEngine } from './audio/MetronomeEngine'
import {
  transportPause,
  transportPlay,
  transportPresetPedalPress,
  transportResume,
  transportTogglePlay,
  transportNextPreset,
  transportPreviousPreset,
} from './audio/transportControls'
import { analyzeWavOvertones, integerizeAnalysisRatios, type OvertoneAnalysisResult } from './audio/overtoneAnalysis'
import type { DroneRuntimeConfig, PartialConfig, TimbreBlend, ToneConfig } from './audio/types'
import { MetronomeControls } from './components/MetronomeControls'
import { NoteSelector } from './components/NoteSelector'
import { OvertoneBars } from './components/OvertoneBars'
import { OvertoneAllSoloButton, OvertoneToneNavControls, HarmonicTimbreToggleButton, overtoneControlButtonSizeClass, overtoneIconButtonClass } from './components/OvertoneToneNavControls'
import { OvertoneMidiPanel } from './components/OvertoneMidiPanel'
import { PartialEditor } from './components/PartialEditor'
import { TimbreMorphSlider } from './components/TimbreMorphSlider'
import { PresetList } from './components/PresetList'
import { ResettableRangeInput } from './components/ResettableRangeInput'
import { SectionCard } from './components/SectionCard'
import { SongLibraryMenu } from './components/SongLibraryMenu'
import { ToneMixer } from './components/ToneMixer'
import { TopControls } from './components/TopControls'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useOvertoneMidi } from './hooks/useOvertoneMidi'
import {
  getTonePageLabel,
  NOTE_IDS,
  type NoteId,
} from './music/notes'
import { getFrequency, findLowestEnabledToneNoteId, findHighestEnabledToneNoteId } from './music/tuning'
import { createDefaultPartials, DEFAULT_MASTER_GAIN_DB, DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS, DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS, DEFAULT_ENTRY_GLIDE_LOWEST_CENTS, DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS, type Preset } from './presets/defaultPresets'
import { useDroneStore } from './store/useDroneStore'
import {
  FOOT_PEDAL_PLAY_KEYS,
  FOOT_PEDAL_PRESET_KEYS,
  isTextEditingTarget,
  matchesFootPedalKey,
  MEDIA_PAUSE_KEYS,
  MEDIA_PLAY_KEYS,
  MEDIA_PLAY_PAUSE_KEYS,
} from './utils/footPedalKeys'
import { BLE_KEYBOARD_FOCUS_ROOT_ID, runMediaSessionAction } from './utils/restoreBleKeyboardFocus'

type TabId = 'tone' | 'overtones' | 'presets' | 'metronome' | 'midi' | 'blank'

function formatEntryGlideCents(cents: number): string {
  if (cents > 0) {
    return `+${cents}c`
  }
  if (cents < 0) {
    return `${cents}c`
  }
  return '0c'
}

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
const STORE_STORAGE_KEY = 'bourdon-store-v1'
const TONE_SET_STORAGE_KEY = 'drone-tone-set-v1'
const TONE_SET_COLLECTION_STORAGE_KEY = 'drone-tone-sets-v1'
const SONG_MENU_TRIGGER_CLASS =
  'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-[#252332] px-3 py-2 text-sm text-white/90 transition hover:bg-[#2f2d3c]'
type OvertoneSnapshot = {
  partials: PartialConfig[]
  timbreBlend: TimbreBlend
}

type PendingOvertoneAnalysis = {
  fileName: string
  analysis: OvertoneAnalysisResult
}

type OvertoneAnalysisApplyMode = 'gain-only' | 'gain-ratios' | 'gain-integer-ratios'

type ToneSetLayout = {
  name: string
  subOctaveIds: NoteId[]
  gridIds: NoteId[]
  toneLabelOverrides?: Partial<Record<NoteId, string>>
}

type ToneSetCollection = {
  customSets: ToneSetLayout[]
}

function buildDefaultToneSetLayout(): ToneSetLayout {
  return {
    name: 'Eesti Torupill',
    subOctaveIds: ['g0', 'a0'],
    gridIds: [
      'c',
      'd',
      'e',
      'f',
      'fis',
      'g',
      'a',
      'h',
      'c1',
      'd1',
      'e1',
      'f1',
      'fis1',
      'g1',
      'a1',
      'h1',
    ],
  }
}

function isUniqueNoteIdList(values: NoteId[]): boolean {
  return new Set(values).size === values.length
}

function parseToneIdList(values: unknown): {
  ids: NoteId[]
  labelOverrides: Partial<Record<NoteId, string>>
} {
  if (!Array.isArray(values)) {
    return { ids: [], labelOverrides: {} }
  }
  const NOTE_ID_ALIAS: Record<string, NoteId> = {
    'ab0': 'gis0',
    'a#0': 'b0',
    'bb0': 'b0',
    'cb1': 'h0',
    'b#0': 'c',
    'db': 'cis',
    'c#': 'cis',
    'eb': 'dis',
    'd#': 'dis',
    'gb': 'fis',
    'f#': 'fis',
    'ab': 'gis',
    'g#': 'gis',
    'a#': 'b',
    'bb': 'b',
    'cb2': 'h1',
    'b#1': 'c1',
    'db1': 'cis1',
    'c#1': 'cis1',
    'eb1': 'dis1',
    'd#1': 'dis1',
    'gb1': 'fis1',
    'f#1': 'fis1',
    'ab1': 'gis1',
    'g#1': 'gis1',
    'a#1': 'b1',
    'bb1': 'b1',
    'b#2': 'c2',
    'db2': 'cis2',
    'c#2': 'cis2',
  }
  const normalized: NoteId[] = []
  const labelOverrides: Partial<Record<NoteId, string>> = {}
  const formatAccidentalLabel = (token: string): string => {
    if (token.includes('b')) {
      return token.replace(/([a-z])b([0-9]?)/g, '$1♭$2')
    }
    if (token.includes('#')) {
      return token.replace(/([a-z])#([0-9]?)/g, '$1♯$2')
    }
    return token
  }
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const token = value.trim().toLowerCase().replace('♯', '#').replace('♭', 'b')
    const aliasResolved = NOTE_ID_ALIAS[token]
    const next = (aliasResolved ?? token) as NoteId
    if (NOTE_IDS.includes(next)) {
      normalized.push(next)
      if (token.includes('b') || token.includes('#')) {
        labelOverrides[next] = formatAccidentalLabel(token)
      }
    }
  }
  return { ids: normalized, labelOverrides }
}

function isValidToneSetLayout(layout: ToneSetLayout): boolean {
  if (layout.subOctaveIds.length > 8 || layout.gridIds.length < 1 || layout.gridIds.length > NOTE_IDS.length) {
    return false
  }
  const merged = [...layout.subOctaveIds, ...layout.gridIds]
  if (merged.length < 1 || merged.length > NOTE_IDS.length) {
    return false
  }
  if (!isUniqueNoteIdList(merged) || merged.some((noteId) => !NOTE_IDS.includes(noteId))) {
    return false
  }
  return true
}

function loadToneSetLayout(): ToneSetLayout {
  if (typeof window === 'undefined') {
    return buildDefaultToneSetLayout()
  }
  try {
    const raw = window.localStorage.getItem(TONE_SET_STORAGE_KEY)
    if (!raw) {
      return buildDefaultToneSetLayout()
    }
    const parsed = JSON.parse(raw) as Partial<ToneSetLayout>
    const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
    const parsedGrid = parseToneIdList(parsed.gridIds)
    const parsedOverrides =
      parsed.toneLabelOverrides && typeof parsed.toneLabelOverrides === 'object'
        ? (parsed.toneLabelOverrides as Partial<Record<NoteId, string>>)
        : {}
    const candidate: ToneSetLayout = {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
      subOctaveIds: parsedSubOctaves.ids,
      gridIds: parsedGrid.ids,
      toneLabelOverrides: {
        ...parsedOverrides,
        ...parsedSubOctaves.labelOverrides,
        ...parsedGrid.labelOverrides,
      },
    }
    if (!isValidToneSetLayout(candidate)) {
      return buildDefaultToneSetLayout()
    }
    return candidate
  } catch {
    return buildDefaultToneSetLayout()
  }
}

function parseToneSetLayout(raw: unknown): ToneSetLayout | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const parsed = raw as Partial<ToneSetLayout>
  const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
  const parsedGrid = parseToneIdList(parsed.gridIds)
  const parsedOverrides =
    parsed.toneLabelOverrides && typeof parsed.toneLabelOverrides === 'object'
      ? (parsed.toneLabelOverrides as Partial<Record<NoteId, string>>)
      : {}
  const candidate: ToneSetLayout = {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
    subOctaveIds: parsedSubOctaves.ids,
    gridIds: parsedGrid.ids,
    toneLabelOverrides: {
      ...parsedOverrides,
      ...parsedSubOctaves.labelOverrides,
      ...parsedGrid.labelOverrides,
    },
  }
  return isValidToneSetLayout(candidate) ? candidate : null
}

function loadToneSetCollection(): ToneSetCollection {
  if (typeof window === 'undefined') {
    return { customSets: [] }
  }
  try {
    const rawCollection = window.localStorage.getItem(TONE_SET_COLLECTION_STORAGE_KEY)
    if (rawCollection) {
      const parsed = JSON.parse(rawCollection) as Partial<ToneSetCollection>
      const customSets = Array.isArray(parsed.customSets)
        ? parsed.customSets
            .map((entry) => parseToneSetLayout(entry))
            .filter((entry): entry is ToneSetLayout => Boolean(entry))
        : []
      return { customSets }
    }
    const legacyRaw = window.localStorage.getItem(TONE_SET_STORAGE_KEY)
    if (!legacyRaw) {
      return { customSets: [] }
    }
    const legacyParsed = JSON.parse(legacyRaw) as Partial<ToneSetLayout>
    const migrated = parseToneSetLayout(legacyParsed)
    if (!migrated) {
      return { customSets: [] }
    }
    if (migrated.name === buildDefaultToneSetLayout().name) {
      return { customSets: [] }
    }
    return { customSets: [migrated] }
  } catch {
    return { customSets: [] }
  }
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

function getLastActiveToneNoteId(source: ToneConfig[]): NoteId | undefined {
  const sortedActive = sortTonesByNoteId(source.filter((tone) => tone.enabled))
  if (sortedActive.length > 0) {
    return sortedActive[sortedActive.length - 1]?.noteId
  }
  const sortedAll = sortTonesByNoteId(source)
  return sortedAll[sortedAll.length - 1]?.noteId
}

function getOvertoneNavigationTones(
  tonesInToneSet: ToneConfig[],
  overtoneToneOptions: ToneConfig[],
  toneSoloRestore: Map<NoteId, boolean> | null,
  allCompareActive: boolean,
): ToneConfig[] {
  if (allCompareActive) {
    return sortTonesByNoteId(tonesInToneSet)
  }
  if (toneSoloRestore !== null) {
    const preSoloActive = tonesInToneSet.filter((tone) => toneSoloRestore.get(tone.noteId) === true)
    return sortTonesByNoteId(preSoloActive)
  }
  return sortTonesByNoteId(overtoneToneOptions)
}

function App() {
  const initialToneSetCollection = useMemo(() => loadToneSetCollection(), [])
  const initialToneSetLayout = useMemo(() => loadToneSetLayout(), [])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('tone')
  const [toneSetLayout, setToneSetLayout] = useState<ToneSetLayout>(initialToneSetLayout)
  const [customToneSets, setCustomToneSets] = useState<ToneSetLayout[]>(initialToneSetCollection.customSets)
  const [selectedCustomToneSetName, setSelectedCustomToneSetName] = useState<string>(
    initialToneSetCollection.customSets[0]?.name ?? '',
  )
  const [selectedOvertoneNoteId, setSelectedOvertoneNoteId] = useState<NoteId>('d')
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }),
  )
  const upPressTimeoutRef = useRef<number | null>(null)
  const droneTitleLongPressTimerRef = useRef<number | null>(null)
  const droneTitleLongPressFiredRef = useRef(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const toneSetImportInputRef = useRef<HTMLInputElement | null>(null)
  const toneSetEditorImportInputRef = useRef<HTMLInputElement | null>(null)
  const globalImportInputRef = useRef<HTMLInputElement | null>(null)
  const overtoneAnalyzeInputRef = useRef<HTMLInputElement | null>(null)
  const sideMenuRef = useRef<HTMLElement | null>(null)
  const mediaAnchorRef = useRef<HTMLAudioElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const overtoneSelectionPinnedRef = useRef(false)
  const previousTabRef = useRef<TabId>('tone')
  const overtoneUndoRef = useRef<Map<NoteId, OvertoneSnapshot[]>>(new Map())
  const overtoneRedoRef = useRef<Map<NoteId, OvertoneSnapshot[]>>(new Map())
  const globalOvertoneUndoRef = useRef<OvertoneSnapshot[]>([])
  const globalOvertoneRedoRef = useRef<OvertoneSnapshot[]>([])
  const overtoneClipboardRef = useRef<PartialConfig[] | null>(null)
  const timbreMorphHistoryActiveRef = useRef(false)
  const [toneSoloRestore, setToneSoloRestore] = useState<Map<NoteId, boolean> | null>(null)
  const [toneSelectionSoloMode, setToneSelectionSoloMode] = useState(false)
  const [allTonesCompareActive, setAllTonesCompareActive] = useState(false)
  const [, setOvertoneHistoryVersion] = useState(0)
  const [pendingOvertoneAnalysis, setPendingOvertoneAnalysis] = useState<PendingOvertoneAnalysis | null>(null)
  const [overtoneAnalysisError, setOvertoneAnalysisError] = useState<string | null>(null)
  const [toneSetOptionsOpen, setToneSetOptionsOpen] = useState(false)
  const [menuExportOpen, setMenuExportOpen] = useState(false)
  const [menuImportOpen, setMenuImportOpen] = useState(false)
  const [entryGlidePanelOpen, setEntryGlidePanelOpen] = useState(false)
  const [toneSetEditorOpen, setToneSetEditorOpen] = useState(false)
  const [toneSetEditorDraft, setToneSetEditorDraft] = useState('')
  const [toneSetQuickName, setToneSetQuickName] = useState('')
  const [toneSetQuickGrid, setToneSetQuickGrid] = useState('')
  const [toneSetJsonCollapsed, setToneSetJsonCollapsed] = useState(true)
  const [toneSetEditorError, setToneSetEditorError] = useState<string | null>(null)
  const playing = useDroneStore((state) => state.playing)
  const activePresetId = useDroneStore((state) => state.activePresetId)
  const songName = useDroneStore((state) => state.songName)
  const songLibrary = useDroneStore((state) => state.songLibrary)
  const presets = useDroneStore((state) => state.presets)
  const tones = useDroneStore((state) => state.tones)
  const toneSetNoteIds = useMemo(
    () => new Set<NoteId>([...toneSetLayout.subOctaveIds, ...toneSetLayout.gridIds]),
    [toneSetLayout.gridIds, toneSetLayout.subOctaveIds],
  )
  const tonesInToneSet = useMemo(
    () => tones.filter((tone) => toneSetNoteIds.has(tone.noteId)),
    [toneSetNoteIds, tones],
  )
  const partials = useDroneStore((state) => state.partials)
  const tuningSystemId = useDroneStore((state) => state.tuningSystemId)
  const tonalCenter = useDroneStore((state) => state.tonalCenter)
  const referenceA4Hz = useDroneStore((state) => state.referenceA4Hz)
  const baseOctave = useDroneStore((state) => state.baseOctave)
  const timbreBlend = useDroneStore((state) => state.timbreBlend)
  const harmonicTimbreEnabled = useDroneStore((state) => state.harmonicTimbreEnabled)
  const entryGlideEnabled = useDroneStore((state) => state.entryGlideEnabled)
  const entryGlideLowestCents = useDroneStore((state) => state.entryGlideLowestCents)
  const entryGlideLowestSeconds = useDroneStore((state) => state.entryGlideLowestSeconds)
  const entryGlideHighestCents = useDroneStore((state) => state.entryGlideHighestCents)
  const entryGlideHighestSeconds = useDroneStore((state) => state.entryGlideHighestSeconds)
  const globalOvertoneEditEnabled = useDroneStore((state) => state.globalOvertoneEditEnabled)
  const masterGainDb = useDroneStore((state) => state.masterGainDb)
  const metronomeEnabled = useDroneStore((state) => state.metronomeEnabled)
  const metronomeBpm = useDroneStore((state) => state.metronomeBpm)
  const metronomeVolumeDb = useDroneStore((state) => state.metronomeVolumeDb)

  const nudgeReferenceA4Hz = useDroneStore((state) => state.nudgeReferenceA4Hz)
  const nudgeBaseOctave = useDroneStore((state) => state.nudgeBaseOctave)
  const setTuningSystemId = useDroneStore((state) => state.setTuningSystemId)
  const setTonalCenter = useDroneStore((state) => state.setTonalCenter)
  const setMasterGainDb = useDroneStore((state) => state.setMasterGainDb)
  const toggleToneEnabled = useDroneStore((state) => state.toggleToneEnabled)
  const setToneGain = useDroneStore((state) => state.setToneGain)
  const setTonePan = useDroneStore((state) => state.setTonePan)
  const setToneDetune = useDroneStore((state) => state.setToneDetune)
  const setTonePartials = useDroneStore((state) => state.setTonePartials)
  const setTonePartialEnabled = useDroneStore((state) => state.setTonePartialEnabled)
  const setTonePartialRatio = useDroneStore((state) => state.setTonePartialRatio)
  const setTonePartialGain = useDroneStore((state) => state.setTonePartialGain)
  const addTonePartial = useDroneStore((state) => state.addTonePartial)
  const removeTonePartial = useDroneStore((state) => state.removeTonePartial)
  const setTimbreValue = useDroneStore((state) => state.setTimbreValue)
  const setToneTimbreValue = useDroneStore((state) => state.setToneTimbreValue)
  const setToneTimbreBlend = useDroneStore((state) => state.setToneTimbreBlend)
  const toggleHarmonicTimbreEnabled = useDroneStore((state) => state.toggleHarmonicTimbreEnabled)
  const toggleEntryGlideEnabled = useDroneStore((state) => state.toggleEntryGlideEnabled)
  const setEntryGlideLowestCents = useDroneStore((state) => state.setEntryGlideLowestCents)
  const setEntryGlideLowestSeconds = useDroneStore((state) => state.setEntryGlideLowestSeconds)
  const setEntryGlideHighestCents = useDroneStore((state) => state.setEntryGlideHighestCents)
  const setEntryGlideHighestSeconds = useDroneStore((state) => state.setEntryGlideHighestSeconds)
  const setGlobalOvertoneEditEnabled = useDroneStore((state) => state.setGlobalOvertoneEditEnabled)
  const enableGlobalOvertoneEditFromTone = useDroneStore((state) => state.enableGlobalOvertoneEditFromTone)
  const applyPartialsGlobally = useDroneStore((state) => state.applyPartialsGlobally)
  const setAllPartialGain = useDroneStore((state) => state.setAllPartialGain)
  const setAllPartialRatio = useDroneStore((state) => state.setAllPartialRatio)
  const setAllPartialEnabled = useDroneStore((state) => state.setAllPartialEnabled)
  const addPartialGlobally = useDroneStore((state) => state.addPartialGlobally)
  const removePartialGlobally = useDroneStore((state) => state.removePartialGlobally)
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
      tonesInToneSet.find((tone) => tone.noteId === selectedOvertoneNoteId) ??
      tonesInToneSet.find((tone) => tone.enabled) ??
      tonesInToneSet[0],
    [selectedOvertoneNoteId, tonesInToneSet],
  )
  const selectedOvertonePartials = useMemo(
    () =>
      globalOvertoneEditEnabled
        ? partials
        : (selectedOvertoneTone?.partials ?? partials),
    [globalOvertoneEditEnabled, partials, selectedOvertoneTone],
  )
  const selectedOvertoneTimbreBlend = useMemo(
    () =>
      globalOvertoneEditEnabled
        ? timbreBlend
        : (selectedOvertoneTone?.timbreBlend ?? timbreBlend),
    [globalOvertoneEditEnabled, selectedOvertoneTone, timbreBlend],
  )
  const setSelectedOvertonePartials = useCallback(
    (nextPartials: PartialConfig[]) => {
      if (globalOvertoneEditEnabled) {
        applyPartialsGlobally(nextPartials)
        return
      }
      setTonePartials(selectedOvertoneNoteId, nextPartials)
    },
    [applyPartialsGlobally, globalOvertoneEditEnabled, selectedOvertoneNoteId, setTonePartials],
  )
  const setSelectedOvertoneGain = useCallback(
    (partialId: string, gainDb: number) => {
      if (globalOvertoneEditEnabled) {
        setAllPartialGain(partialId, gainDb)
        return
      }
      setTonePartialGain(selectedOvertoneNoteId, partialId, gainDb)
    },
    [globalOvertoneEditEnabled, selectedOvertoneNoteId, setAllPartialGain, setTonePartialGain],
  )
  const setSelectedOvertoneRatio = useCallback(
    (partialId: string, ratio: number) => {
      if (globalOvertoneEditEnabled) {
        setAllPartialRatio(partialId, ratio)
        return
      }
      setTonePartialRatio(selectedOvertoneNoteId, partialId, ratio)
    },
    [globalOvertoneEditEnabled, selectedOvertoneNoteId, setAllPartialRatio, setTonePartialRatio],
  )
  const setSelectedOvertoneEnabled = useCallback(
    (partialId: string, enabled: boolean) => {
      if (globalOvertoneEditEnabled) {
        setAllPartialEnabled(partialId, enabled)
        return
      }
      setTonePartialEnabled(selectedOvertoneNoteId, partialId, enabled)
    },
    [globalOvertoneEditEnabled, selectedOvertoneNoteId, setAllPartialEnabled, setTonePartialEnabled],
  )
  const addSelectedOvertonePartial = useCallback(() => {
    if (globalOvertoneEditEnabled) {
      addPartialGlobally()
      return
    }
    addTonePartial(selectedOvertoneNoteId)
  }, [addPartialGlobally, addTonePartial, globalOvertoneEditEnabled, selectedOvertoneNoteId])
  const removeSelectedOvertonePartial = useCallback(
    (partialId: string) => {
      if (globalOvertoneEditEnabled) {
        removePartialGlobally(partialId)
        return
      }
      removeTonePartial(selectedOvertoneNoteId, partialId)
    },
    [globalOvertoneEditEnabled, removePartialGlobally, removeTonePartial, selectedOvertoneNoteId],
  )
  const setSelectedOvertoneTimbreValue = useCallback(
    (key: 'sine' | 'saw' | 'square', value: number) => {
      if (globalOvertoneEditEnabled) {
        setTimbreValue(key, value)
        return
      }
      setToneTimbreValue(selectedOvertoneNoteId, key, value)
    },
    [globalOvertoneEditEnabled, selectedOvertoneNoteId, setTimbreValue, setToneTimbreValue],
  )
  const setSelectedOvertoneTimbreBlend = useCallback(
    (nextTimbreBlend: TimbreBlend) => {
      if (globalOvertoneEditEnabled) {
        setTimbreValue('sine', nextTimbreBlend.sine)
        setTimbreValue('saw', nextTimbreBlend.saw)
        setTimbreValue('square', nextTimbreBlend.square)
        return
      }
      setToneTimbreBlend(selectedOvertoneNoteId, nextTimbreBlend)
    },
    [globalOvertoneEditEnabled, selectedOvertoneNoteId, setTimbreValue, setToneTimbreBlend],
  )

  const toggleGlobalOvertoneEdit = useCallback(() => {
    if (globalOvertoneEditEnabled) {
      setGlobalOvertoneEditEnabled(false)
      return
    }
    enableGlobalOvertoneEditFromTone(selectedOvertoneNoteId)
  }, [enableGlobalOvertoneEditFromTone, globalOvertoneEditEnabled, selectedOvertoneNoteId, setGlobalOvertoneEditEnabled])

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
    const sourcePartials = globalOvertoneEditEnabled
      ? state.partials
      : (selectedTone?.partials ?? selectedOvertonePartials)
    const sourceTimbre = globalOvertoneEditEnabled
      ? state.timbreBlend
      : (selectedTone?.timbreBlend ?? selectedOvertoneTimbreBlend)
    return {
      partials: clonePartials(sourcePartials),
      timbreBlend: cloneTimbreBlend(sourceTimbre),
    }
  }, [
    clonePartials,
    cloneTimbreBlend,
    globalOvertoneEditEnabled,
    selectedOvertoneNoteId,
    selectedOvertonePartials,
    selectedOvertoneTimbreBlend,
  ])

  const applyOvertoneSnapshot = useCallback(
    (snapshot: OvertoneSnapshot) => {
      setSelectedOvertonePartials(clonePartials(snapshot.partials))
      setSelectedOvertoneTimbreBlend(cloneTimbreBlend(snapshot.timbreBlend))
    },
    [clonePartials, cloneTimbreBlend, setSelectedOvertonePartials, setSelectedOvertoneTimbreBlend],
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
    if (globalOvertoneEditEnabled) {
      const undoStack = globalOvertoneUndoRef.current
      const currentTop = undoStack[undoStack.length - 1]
      if (currentTop && sameOvertoneSnapshot(currentTop, snapshot)) {
        return
      }
      undoStack.push(snapshot)
      if (undoStack.length > MAX_OVERTONE_HISTORY) {
        undoStack.shift()
      }
      globalOvertoneRedoRef.current = []
      setOvertoneHistoryVersion((value) => value + 1)
      return
    }
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
  }, [
    getCurrentOvertoneSnapshot,
    getOvertoneHistoryStack,
    globalOvertoneEditEnabled,
    sameOvertoneSnapshot,
    selectedOvertoneNoteId,
  ])

  const undoOvertoneChange = useCallback(() => {
    if (globalOvertoneEditEnabled) {
      const previous = globalOvertoneUndoRef.current.pop()
      if (!previous) {
        return
      }
      globalOvertoneRedoRef.current.push(getCurrentOvertoneSnapshot())
      applyOvertoneSnapshot(previous)
      setOvertoneHistoryVersion((value) => value + 1)
      return
    }
    const undoStack = getOvertoneHistoryStack(overtoneUndoRef.current, selectedOvertoneNoteId)
    const previous = undoStack.pop()
    if (!previous) {
      return
    }
    const redoStack = getOvertoneHistoryStack(overtoneRedoRef.current, selectedOvertoneNoteId)
    redoStack.push(getCurrentOvertoneSnapshot())
    applyOvertoneSnapshot(previous)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [
    applyOvertoneSnapshot,
    getCurrentOvertoneSnapshot,
    getOvertoneHistoryStack,
    globalOvertoneEditEnabled,
    selectedOvertoneNoteId,
  ])

  const redoOvertoneChange = useCallback(() => {
    if (globalOvertoneEditEnabled) {
      const next = globalOvertoneRedoRef.current.pop()
      if (!next) {
        return
      }
      globalOvertoneUndoRef.current.push(getCurrentOvertoneSnapshot())
      applyOvertoneSnapshot(next)
      setOvertoneHistoryVersion((value) => value + 1)
      return
    }
    const redoStack = getOvertoneHistoryStack(overtoneRedoRef.current, selectedOvertoneNoteId)
    const next = redoStack.pop()
    if (!next) {
      return
    }
    const undoStack = getOvertoneHistoryStack(overtoneUndoRef.current, selectedOvertoneNoteId)
    undoStack.push(getCurrentOvertoneSnapshot())
    applyOvertoneSnapshot(next)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [
    applyOvertoneSnapshot,
    getCurrentOvertoneSnapshot,
    getOvertoneHistoryStack,
    globalOvertoneEditEnabled,
    selectedOvertoneNoteId,
  ])

  const canUndoOvertones = globalOvertoneEditEnabled
    ? globalOvertoneUndoRef.current.length > 0
    : (overtoneUndoRef.current.get(selectedOvertoneNoteId)?.length ?? 0) > 0
  const canRedoOvertones = globalOvertoneEditEnabled
    ? globalOvertoneRedoRef.current.length > 0
    : (overtoneRedoRef.current.get(selectedOvertoneNoteId)?.length ?? 0) > 0
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

  const canDeactivateAllPartials = useMemo(
    () => selectedOvertonePartials.some((partial) => partial.enabled),
    [selectedOvertonePartials],
  )

  const deactivateAllPartials = useCallback(() => {
    if (!canDeactivateAllPartials) {
      return
    }
    rememberOvertoneState()
    selectedOvertonePartials.forEach((partial) => {
      if (partial.enabled) {
        overtoneMidi.onPartialEnabledFromUi(partial.id, false)
      }
    })
  }, [canDeactivateAllPartials, overtoneMidi, rememberOvertoneState, selectedOvertonePartials])

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

  const exportGlobalData = useCallback(() => {
    const payload = {
      kind: 'bourdon-global-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        [STORE_STORAGE_KEY]: window.localStorage.getItem(STORE_STORAGE_KEY),
        [TONE_SET_STORAGE_KEY]: window.localStorage.getItem(TONE_SET_STORAGE_KEY),
        [TONE_SET_COLLECTION_STORAGE_KEY]: window.localStorage.getItem(TONE_SET_COLLECTION_STORAGE_KEY),
      },
    }
    downloadJson(payload, `drone-global-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }, [downloadJson])

  const importGlobalData = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      try {
        const content = await file.text()
        const parsed = JSON.parse(content) as {
          kind?: string
          data?: Record<string, string | null>
        }
        if (parsed.kind !== 'bourdon-global-backup' || !parsed.data) {
          window.alert('Invalid global backup file.')
          return
        }
        const keys = [STORE_STORAGE_KEY, TONE_SET_STORAGE_KEY, TONE_SET_COLLECTION_STORAGE_KEY] as const
        for (const key of keys) {
          const value = parsed.data[key]
          if (typeof value === 'string') {
            window.localStorage.setItem(key, value)
          } else if (value === null) {
            window.localStorage.removeItem(key)
          }
        }
        window.alert('Global backup imported. App will reload now.')
        window.location.reload()
      } catch {
        window.alert('Could not import global backup.')
      } finally {
        if (globalImportInputRef.current) {
          globalImportInputRef.current.value = ''
        }
      }
    },
    [],
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

  const saveOvertoneToActivePreset = useCallback(() => {
    saveActivePreset()
  }, [saveActivePreset])

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
        const presetNameFromFile = file.name.replace(/\.[^/.]+$/, '').trim() || 'Analyzed WAV'
        setOvertoneAnalysisError(null)
        setPendingOvertoneAnalysis({
          fileName: presetNameFromFile,
          analysis,
        })
      } catch {
        setOvertoneAnalysisError('Could not analyze overtone balance from this audio file.')
      } finally {
        if (overtoneAnalyzeInputRef.current) {
          overtoneAnalyzeInputRef.current.value = ''
        }
      }
    },
    [selectedOvertonePartials.length],
  )

  const applyPendingOvertoneAnalysis = useCallback(
    (mode: OvertoneAnalysisApplyMode) => {
      if (!pendingOvertoneAnalysis) {
        return
      }
      const { analysis } = pendingOvertoneAnalysis
      const integerRatios =
        mode === 'gain-integer-ratios'
          ? integerizeAnalysisRatios(analysis.ratios, selectedOvertonePartials.length)
          : null
      const analyzed = selectedOvertonePartials.map((partial, index) => {
        const gainDb = analysis.gainsDb[index] ?? -48
        let ratio = partial.ratio
        if (mode === 'gain-ratios') {
          ratio = analysis.ratios[index] ?? partial.ratio
        } else if (mode === 'gain-integer-ratios') {
          ratio = integerRatios?.[index] ?? index + 1
        }
        return {
          ...partial,
          ratio,
          gainDb,
        }
      })
      setSelectedOvertonePartials(analyzed)
      saveActivePreset()
      setPendingOvertoneAnalysis(null)
    },
    [pendingOvertoneAnalysis, saveActivePreset, selectedOvertonePartials, setSelectedOvertonePartials],
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
  const saveToneSetLayout = useCallback((layout: ToneSetLayout) => {
    setToneSetLayout(layout)
    try {
      window.localStorage.setItem(TONE_SET_STORAGE_KEY, JSON.stringify(layout))
    } catch {
      // Ignore storage quota / private mode failures.
    }
  }, [])
  const persistCustomToneSets = useCallback((next: ToneSetLayout[]) => {
    setCustomToneSets(next)
    try {
      window.localStorage.setItem(TONE_SET_COLLECTION_STORAGE_KEY, JSON.stringify({ customSets: next }))
    } catch {
      // Ignore storage failures.
    }
  }, [])
  const upsertCustomToneSet = useCallback(
    (layout: ToneSetLayout) => {
      const next = [...customToneSets]
      const existingIndex = next.findIndex((entry) => entry.name === layout.name)
      if (existingIndex >= 0) {
        next[existingIndex] = layout
      } else {
        next.push(layout)
      }
      persistCustomToneSets(next)
      setSelectedCustomToneSetName(layout.name)
    },
    [customToneSets, persistCustomToneSets],
  )
  const setDefaultToneSet = useCallback(() => {
    saveToneSetLayout(buildDefaultToneSetLayout())
  }, [saveToneSetLayout])
  const openToneSetOptions = useCallback(() => {
    setToneSetOptionsOpen(true)
    setMenuOpen(false)
  }, [])
  const loadSavedToneSetFromBrowser = useCallback(
    (name: string) => {
      const selected = customToneSets.find((entry) => entry.name === name)
      if (!selected) {
        window.alert('No saved custom tone set found in browser memory.')
        return
      }
      saveToneSetLayout(selected)
    },
    [customToneSets, saveToneSetLayout],
  )
  const deleteSavedToneSetFromBrowser = useCallback(() => {
    const targetName = selectedCustomToneSetName.trim()
    if (!targetName) {
      window.alert('Select a custom tone set to delete.')
      return
    }
    const next = customToneSets.filter((entry) => entry.name !== targetName)
    persistCustomToneSets(next)
    setSelectedCustomToneSetName(next[0]?.name ?? '')
    window.alert('Saved custom tone set deleted from browser memory.')
    setToneSetOptionsOpen(false)
  }, [customToneSets, persistCustomToneSets, selectedCustomToneSetName])
  const loadCustomToneSet = useCallback(() => {
    setToneSetEditorDraft(JSON.stringify(toneSetLayout, null, 2))
    setToneSetQuickName(toneSetLayout.name)
    setToneSetQuickGrid(
      [...toneSetLayout.subOctaveIds, ...toneSetLayout.gridIds]
        .map((noteId) => {
          const override = toneSetLayout.toneLabelOverrides?.[noteId]
          if (!override) {
            return noteId
          }
          return override.toLowerCase().replaceAll('♭', 'b').replaceAll('♯', '#')
        })
        .join(', '),
    )
    setToneSetEditorError(null)
    setToneSetJsonCollapsed(true)
    setToneSetEditorOpen(true)
    setToneSetOptionsOpen(false)
  }, [toneSetLayout])
  const syncDraftFromQuickEditor = useCallback((nextName: string, nextGrid: string) => {
    const splitTokens = (raw: string): string[] =>
      raw
        .split(/[\s,;\n\r\t]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map((token) => token.toLowerCase().replace('♭', 'b').replace('♯', '#'))

    const rawTokens = splitTokens(nextGrid)
    const parsedCombined = parseToneIdList(rawTokens)
    const nextSubOctaves = rawTokens.filter((token) => /0$/.test(token))
    const nextGridIds = rawTokens.filter((token) => !/0$/.test(token))

    const next = {
      name: nextName.trim() || 'Custom',
      subOctaveIds: nextSubOctaves,
      gridIds: nextGridIds,
      toneLabelOverrides: {
        ...parsedCombined.labelOverrides,
      },
    }
    setToneSetEditorDraft(JSON.stringify(next, null, 2))
    setToneSetEditorError(null)
  }, [])
  const saveAndApplyCustomToneSet = useCallback(() => {
    try {
      const parsed = JSON.parse(toneSetEditorDraft) as Partial<ToneSetLayout>
      const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
      const parsedGrid = parseToneIdList(parsed.gridIds)
      const candidate: ToneSetLayout = {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
        subOctaveIds: parsedSubOctaves.ids,
        gridIds: parsedGrid.ids,
        toneLabelOverrides: {
          ...parsedSubOctaves.labelOverrides,
          ...parsedGrid.labelOverrides,
        },
      }
      if (!isValidToneSetLayout(candidate)) {
        setToneSetEditorError(
          'Invalid tone set. Use note ids from G0..D2 (also #/b accepted), with unique values only.',
        )
        return
      }
      upsertCustomToneSet(candidate)
      saveToneSetLayout(candidate)
      setToneSetEditorError(null)
      setToneSetEditorOpen(false)
      window.alert('Custom tone set saved and applied.')
    } catch {
      setToneSetEditorError('Invalid JSON for custom tone set.')
    }
  }, [saveToneSetLayout, toneSetEditorDraft, upsertCustomToneSet])
  const saveCustomToneSetFile = useCallback(() => {
    try {
      const parsed = JSON.parse(toneSetEditorDraft) as Partial<ToneSetLayout>
      const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
      const parsedGrid = parseToneIdList(parsed.gridIds)
      const candidate: ToneSetLayout = {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
        subOctaveIds: parsedSubOctaves.ids,
        gridIds: parsedGrid.ids,
        toneLabelOverrides: {
          ...parsedSubOctaves.labelOverrides,
          ...parsedGrid.labelOverrides,
        },
      }
      if (!isValidToneSetLayout(candidate)) {
        setToneSetEditorError(
          'Invalid tone set. Use note ids from G0..D2 (also #/b accepted), with unique values only.',
        )
        return
      }
      downloadJson(candidate, `${makeSafeFileName(candidate.name, 'tone-set')}.tone-set.json`)
      setToneSetEditorError(null)
    } catch {
      setToneSetEditorError('Invalid JSON for custom tone set.')
    }
  }, [downloadJson, makeSafeFileName, toneSetEditorDraft])
  const exportCurrentToneSet = useCallback(() => {
    downloadJson(toneSetLayout, `${makeSafeFileName(toneSetLayout.name, 'tone-set')}.tone-set.json`)
  }, [downloadJson, makeSafeFileName, toneSetLayout])
  const importToneSetFromFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      try {
        const content = await file.text()
        const parsed = JSON.parse(content) as unknown
        const candidate = parseToneSetLayout(parsed)
        if (!candidate) {
          window.alert('Invalid tone set JSON.')
          return
        }
        upsertCustomToneSet(candidate)
        saveToneSetLayout(candidate)
        window.alert('Tone set imported and applied.')
      } catch {
        window.alert('Could not import tone set JSON.')
      } finally {
        if (toneSetImportInputRef.current) {
          toneSetImportInputRef.current.value = ''
        }
      }
    },
    [saveToneSetLayout, upsertCustomToneSet],
  )
  const importToneSetIntoEditorFromFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      try {
        const content = await file.text()
        const parsed = JSON.parse(content) as unknown
        const candidate = parseToneSetLayout(parsed)
        if (!candidate) {
          setToneSetEditorError('Invalid tone set JSON.')
          return
        }
        setToneSetQuickName(candidate.name)
        setToneSetQuickGrid([...candidate.subOctaveIds, ...candidate.gridIds].join(', '))
        setToneSetEditorDraft(JSON.stringify(candidate, null, 2))
        setToneSetEditorError(null)
        setToneSetJsonCollapsed(true)
      } catch {
        setToneSetEditorError('Could not import tone set JSON.')
      } finally {
        if (toneSetEditorImportInputRef.current) {
          toneSetEditorImportInputRef.current.value = ''
        }
      }
    },
    [],
  )
  const handleMetronomeEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        metronomeEngine.prepareContext()
      }
      setMetronomeEnabled(enabled)
    },
    [setMetronomeEnabled],
  )

  const activeTones = useMemo(() => tonesInToneSet.filter((tone) => tone.enabled), [tonesInToneSet])
  const toneMixerTones = useMemo(() => {
    const toneById = new Map(tones.map((tone) => [tone.noteId, tone]))
    const orderedIds = [...toneSetLayout.subOctaveIds, ...toneSetLayout.gridIds]
    return orderedIds
      .map((noteId) => toneById.get(noteId))
      .filter((tone): tone is ToneConfig => Boolean(tone?.enabled))
  }, [toneSetLayout.gridIds, toneSetLayout.subOctaveIds, tones])
  const overtoneToneOptions = activeTones.length > 0 ? activeTones : tonesInToneSet
  const isSelectedOvertoneToneSolo = useMemo(
    () => isToneStrictSolo(tonesInToneSet, selectedOvertoneNoteId),
    [selectedOvertoneNoteId, tonesInToneSet],
  )
  const overtoneNavigationTones = useMemo(
    () =>
      getOvertoneNavigationTones(
        tonesInToneSet,
        overtoneToneOptions,
        toneSoloRestore,
        allTonesCompareActive,
      ),
    [allTonesCompareActive, overtoneToneOptions, toneSoloRestore, tonesInToneSet],
  )
  const canNavigateOvertoneTone = allTonesCompareActive
    ? tonesInToneSet.length > 1
    : overtoneNavigationTones.length > 1
  const selectedOvertoneToneLabel = selectedOvertoneTone
    ? getTonePageLabel(selectedOvertoneTone.noteId)
    : 'Tone'
  const isAllTonesCompareActive = allTonesCompareActive
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
    setAllTonesCompareActive(false)
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
      setAllTonesCompareActive(false)
      if (toneSoloRestore === null) {
        setToneSoloRestore(restoreState)
      }
      applyToneEnabledMap(soloState)
    },
    [applyToneEnabledMap, toneSoloRestore],
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
  const handleToneSelectionPress = useCallback(
    (noteId: NoteId) => {
      if (toneSelectionSoloMode) {
        enterToneSoloForNote(noteId)
        return
      }
      toggleToneEnabled(noteId)
    },
    [enterToneSoloForNote, toneSelectionSoloMode, toggleToneEnabled],
  )
  const handleToneSelectionLongPress = useCallback(
    (noteId: NoteId) => {
      if (toneSelectionSoloMode) {
        restoreToneSoloState()
        setToneSelectionSoloMode(false)
        return
      }
      enterToneSoloForNote(noteId)
      setToneSelectionSoloMode(true)
    },
    [enterToneSoloForNote, restoreToneSoloState, toneSelectionSoloMode],
  )
  useEffect(() => {
    if (!toneSoloRestore || allTonesCompareActive) {
      setToneSelectionSoloMode(false)
    }
  }, [allTonesCompareActive, toneSoloRestore])
  const toggleAllTonesCompare = useCallback(() => {
    if (allTonesCompareActive) {
      restoreToneSoloState()
      return
    }
    const currentTones = useDroneStore.getState().tones
    if (toneSoloRestore === null) {
      const restoreState = new Map<NoteId, boolean>()
      currentTones.forEach((tone) => {
        restoreState.set(tone.noteId, tone.enabled)
      })
      setToneSoloRestore(restoreState)
    }
    setAllTonesCompareActive(true)
    const soloState = new Map<NoteId, boolean>()
    currentTones
      .filter((tone) => toneSetNoteIds.has(tone.noteId))
      .forEach((tone) => {
        soloState.set(tone.noteId, tone.noteId === selectedOvertoneNoteId)
      })
    applyToneEnabledMap(soloState)
  }, [
    allTonesCompareActive,
    applyToneEnabledMap,
    restoreToneSoloState,
    selectedOvertoneNoteId,
    toneSetNoteIds,
    toneSoloRestore,
  ])
  const selectAdjacentOvertoneTone = useCallback(
    (direction: 'previous' | 'next') => {
      const currentTones = useDroneStore.getState().tones
      const scopedTones = currentTones.filter((tone) => toneSetNoteIds.has(tone.noteId))
      const activeTonesNow = scopedTones.filter((tone) => tone.enabled)
      const toneOptionsNow = activeTonesNow.length > 0 ? activeTonesNow : scopedTones
      const navigationTones = getOvertoneNavigationTones(
        scopedTones,
        toneOptionsNow,
        toneSoloRestore,
        allTonesCompareActive,
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
      if (
        toneSoloRestore !== null ||
        allTonesCompareActive ||
        isToneStrictSolo(scopedTones, selectedOvertoneNoteId)
      ) {
        const soloState = new Map<NoteId, boolean>()
        scopedTones.forEach((tone) => {
          soloState.set(tone.noteId, tone.noteId === nextNoteId)
        })
        applyToneEnabledMap(soloState)
      }
    },
    [allTonesCompareActive, applyToneEnabledMap, selectedOvertoneNoteId, toneSetNoteIds, toneSoloRestore],
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
  const lowestToneGlideNoteId = useMemo(
    () =>
      findLowestEnabledToneNoteId(
        tonesInToneSet,
        tuningSystemId,
        tonalCenter,
        referenceA4Hz,
        baseOctave,
      ),
    [baseOctave, referenceA4Hz, tonalCenter, tonesInToneSet, tuningSystemId],
  )
  const highestToneGlideNoteId = useMemo(
    () =>
      findHighestEnabledToneNoteId(
        tonesInToneSet,
        tuningSystemId,
        tonalCenter,
        referenceA4Hz,
        baseOctave,
      ),
    [baseOctave, referenceA4Hz, tonalCenter, tonesInToneSet, tuningSystemId],
  )
  const runtimeConfig = useMemo<DroneRuntimeConfig>(
    () => ({
      referenceA4Hz,
      baseOctave,
      tuningSystemId,
      tonalCenter,
      masterGainDb,
      timbreBlend,
      harmonicTimbreEnabled,
      tones: tonesInToneSet,
      partials,
      lowestToneGlideNoteId: entryGlideEnabled ? lowestToneGlideNoteId : null,
      highestToneGlideNoteId: entryGlideEnabled ? highestToneGlideNoteId : null,
      lowestToneGlide: entryGlideEnabled
        ? {
            cents: entryGlideLowestCents,
            seconds: entryGlideLowestSeconds,
          }
        : null,
      highestToneGlide: entryGlideEnabled
        ? {
            cents: entryGlideHighestCents,
            seconds: entryGlideHighestSeconds,
          }
        : null,
    }),
    [
      referenceA4Hz,
      baseOctave,
      tuningSystemId,
      tonalCenter,
      masterGainDb,
      timbreBlend,
      harmonicTimbreEnabled,
      entryGlideEnabled,
      entryGlideLowestCents,
      entryGlideLowestSeconds,
      entryGlideHighestCents,
      entryGlideHighestSeconds,
      tonesInToneSet,
      partials,
      lowestToneGlideNoteId,
      highestToneGlideNoteId,
    ],
  )

  const latestRuntimeConfigRef = useRef<DroneRuntimeConfig>(runtimeConfig)
  useEffect(() => {
    latestRuntimeConfigRef.current = runtimeConfig
  }, [runtimeConfig])

  const handleTogglePlay = useCallback(() => {
    transportTogglePlay(latestRuntimeConfigRef.current)
  }, [])

  const handlePresetPedalPress = useCallback(() => {
    transportPresetPedalPress(upPressTimeoutRef)
  }, [])

  useEffect(() => {
    useDroneStore.setState((state) => ({
      tones: state.tones.map((tone) => (toneSetNoteIds.has(tone.noteId) ? tone : { ...tone, enabled: false })),
    }))
  }, [toneSetNoteIds])

  useEffect(() => {
    if (!tonesInToneSet.some((tone) => tone.noteId === selectedOvertoneNoteId)) {
      const fallbackNoteId = getLastActiveToneNoteId(tonesInToneSet)
      if (fallbackNoteId) {
        setSelectedOvertoneNoteId(fallbackNoteId)
      }
    }
  }, [selectedOvertoneNoteId, tonesInToneSet])

  useEffect(() => {
    const previousTab = previousTabRef.current
    previousTabRef.current = activeTab
    if (activeTab !== 'overtones' || previousTab === 'overtones') {
      return
    }
    if (overtoneSelectionPinnedRef.current) {
      overtoneSelectionPinnedRef.current = false
      return
    }
    const lastActiveToneNoteId = getLastActiveToneNoteId(tonesInToneSet)
    if (lastActiveToneNoteId) {
      setSelectedOvertoneNoteId(lastActiveToneNoteId)
    }
  }, [activeTab, tonesInToneSet])

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
      runMediaSessionAction(() => {
        transportPlay(latestRuntimeConfigRef.current)
      })
    })
    setActionHandler('pause', () => {
      runMediaSessionAction(transportPause)
    })
    setActionHandler('nexttrack', () => {
      runMediaSessionAction(transportNextPreset)
    })
    setActionHandler('previoustrack', () => {
      runMediaSessionAction(transportPreviousPreset)
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
    anchor.setAttribute('aria-hidden', 'true')
    anchor.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none'
    document.body.appendChild(anchor)
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
      anchor.remove()
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) {
        return
      }

      const isPlayPedal = matchesFootPedalKey(event, FOOT_PEDAL_PLAY_KEYS)
      const isPresetPedal = matchesFootPedalKey(event, FOOT_PEDAL_PRESET_KEYS)

      if (isPlayPedal || isPresetPedal) {
        if (event.repeat) {
          event.preventDefault()
          return
        }
        event.preventDefault()
        event.stopPropagation()
      }

      if (isPlayPedal) {
        handleTogglePlay()
        return
      }

      if (isPresetPedal) {
        handlePresetPedalPress()
        return
      }

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        handleTogglePlay()
        return
      }
      if (matchesFootPedalKey(event, MEDIA_PLAY_PAUSE_KEYS)) {
        event.preventDefault()
        handleTogglePlay()
        return
      }
      if (matchesFootPedalKey(event, MEDIA_PLAY_KEYS)) {
        event.preventDefault()
        transportResume(latestRuntimeConfigRef.current)
        return
      }
      if (matchesFootPedalKey(event, MEDIA_PAUSE_KEYS)) {
        event.preventDefault()
        transportPause()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      if (upPressTimeoutRef.current !== null) {
        window.clearTimeout(upPressTimeoutRef.current)
        upPressTimeoutRef.current = null
      }
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [handleTogglePlay, handlePresetPedalPress])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [])

  const resetTabScroll = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    if (previewScrollRef.current) {
      previewScrollRef.current.scrollTop = 0
    }
  }, [])

  useLayoutEffect(() => {
    if (activeTab !== 'overtones' && activeTab !== 'presets' && activeTab !== 'metronome') {
      return
    }
    resetTabScroll()
  }, [activeTab, resetTabScroll])

  useEffect(() => {
    if (activeTab !== 'overtones') {
      return
    }
    const onOrientationChange = () => {
      resetTabScroll()
    }
    window.addEventListener('orientationchange', onOrientationChange)
    return () => window.removeEventListener('orientationchange', onOrientationChange)
  }, [activeTab, resetTabScroll])

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
      <div
        id={BLE_KEYBOARD_FOCUS_ROOT_ID}
        tabIndex={-1}
        aria-hidden="true"
        className="fixed size-0 overflow-hidden opacity-0"
      />
      <div
        className={`mx-auto w-full max-w-md px-3 pb-5 pt-0 landscape:max-w-none max-h-[500px]:max-w-none md:max-w-5xl ${
          activeTab === 'overtones' ? 'landscape:pt-0 max-h-[500px]:pt-0' : ''
        }`}
      >
        <div
          className={`sticky top-0 z-40 -mx-3 bg-[#111019] px-3 pb-2 pt-[env(safe-area-inset-top,0px)] ${
            activeTab === 'tone' ? '' : 'landscape:hidden max-h-[500px]:hidden'
          }`}
        >
          <header className="mx-auto flex max-w-[26.5rem] items-center gap-3 rounded-xl border border-white/10 bg-[#111019] px-3 py-2 landscape:hidden max-h-[500px]:hidden md:max-w-[62.5rem]">
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
          {activeTab === 'tone' && (
            <div className="mx-auto mt-3 grid max-w-[26.5rem] grid-cols-2 gap-3 landscape:mt-0 max-h-[500px]:mt-0 md:max-w-[62.5rem]">
              <article className="relative min-w-0 overflow-hidden rounded-xl border border-fuchsia-300/45 bg-[#211a2d] p-3">
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
              <article className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] p-3">
                <h2 className="mb-2 pr-[4.25rem] text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
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
                  triggerClassName="mt-5 flex min-h-0 w-full max-w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-white/10 bg-white/10 px-2 py-1 text-sm font-semibold text-white/95 transition hover:bg-white/15"
                />
              </article>
            </div>
          )}
        </div>

        <main
          className={`landscape:pb-2 max-h-[500px]:pb-2 ${
            activeTab === 'blank' ? 'pb-20' : activeTab === 'metronome' ? 'pb-32' : 'pb-44'
          }`}
        >
          <div className="space-y-3" role="tabpanel" id="panel-tone" aria-labelledby="tab-tone" hidden={activeTab !== 'tone'}>
            <SectionCard title="Global controls" className="[&>header]:mb-2.5">
              <div className="space-y-3">
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
                <NoteSelector
                  tones={tones}
                  toneSetName={toneSetLayout.name}
                  subOctaveIds={toneSetLayout.subOctaveIds}
                  gridIds={toneSetLayout.gridIds}
                  toneLabelOverrides={toneSetLayout.toneLabelOverrides}
                  soloModeActive={toneSelectionSoloMode}
                  onTonePress={handleToneSelectionPress}
                  onToneLongPress={handleToneSelectionLongPress}
                />
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="button-safe flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setEntryGlidePanelOpen((current) => !current)}
                      aria-expanded={entryGlidePanelOpen}
                      aria-controls="entry-glide-controls"
                    >
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-white/60 transition-transform ${entryGlidePanelOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                      <span className="text-xs uppercase tracking-[0.16em] text-white/60">Entry glide</span>
                    </button>
                    <button
                      type="button"
                      className={`button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                        entryGlideEnabled
                          ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100 hover:bg-fuchsia-300/30'
                          : 'border-white/15 bg-white/5 text-white/80 opacity-40 hover:bg-white/10'
                      }`}
                      onClick={toggleEntryGlideEnabled}
                      aria-label="Toggle entry glide for lowest and highest tones"
                      aria-pressed={entryGlideEnabled}
                      title="Entry glide"
                    >
                      <ArrowDownUp size={15} aria-hidden />
                    </button>
                  </div>
                  {entryGlidePanelOpen ? (
                    <div
                      id="entry-glide-controls"
                      className={`mt-3 space-y-3 border-t border-white/10 pt-3 ${entryGlideEnabled ? '' : 'opacity-50'}`}
                    >
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                          Lowest tone
                        </div>
                        <div className="grid grid-cols-[1.25rem_1fr_3rem] items-center gap-2">
                          <span className="text-xs text-white/55">C</span>
                          <ResettableRangeInput
                            min={-50}
                            max={50}
                            step={1}
                            value={entryGlideLowestCents}
                            disabled={!entryGlideEnabled}
                            onChange={(event) => setEntryGlideLowestCents(Number(event.target.value))}
                            onReset={() => setEntryGlideLowestCents(DEFAULT_ENTRY_GLIDE_LOWEST_CENTS)}
                            aria-label="Lowest tone entry glide cents. Positive glides down from above, negative glides up from below."
                            className="h-1.5 w-full accent-fuchsia-300"
                          />
                          <span className="text-right text-xs tabular-nums text-white/70">
                            {formatEntryGlideCents(entryGlideLowestCents)}
                          </span>
                        </div>
                        <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
                          <span className="text-xs text-white/55">S</span>
                          <ResettableRangeInput
                            min={0}
                            max={4}
                            step={0.1}
                            value={entryGlideLowestSeconds}
                            disabled={!entryGlideEnabled}
                            onChange={(event) => setEntryGlideLowestSeconds(Number(event.target.value))}
                            onReset={() => setEntryGlideLowestSeconds(DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS)}
                            aria-label="Lowest tone entry glide seconds"
                            className="h-1.5 w-full accent-fuchsia-300"
                          />
                          <span className="text-right text-xs tabular-nums text-white/70">
                            {entryGlideLowestSeconds.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                          Highest tone
                        </div>
                        <div className="grid grid-cols-[1.25rem_1fr_3rem] items-center gap-2">
                          <span className="text-xs text-white/55">C</span>
                          <ResettableRangeInput
                            min={-50}
                            max={50}
                            step={1}
                            value={entryGlideHighestCents}
                            disabled={!entryGlideEnabled}
                            onChange={(event) => setEntryGlideHighestCents(Number(event.target.value))}
                            onReset={() => setEntryGlideHighestCents(DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS)}
                            aria-label="Highest tone entry glide cents. Positive glides down from above, negative glides up from below."
                            className="h-1.5 w-full accent-fuchsia-300"
                          />
                          <span className="text-right text-xs tabular-nums text-white/70">
                            {formatEntryGlideCents(entryGlideHighestCents)}
                          </span>
                        </div>
                        <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
                          <span className="text-xs text-white/55">S</span>
                          <ResettableRangeInput
                            min={0}
                            max={4}
                            step={0.1}
                            value={entryGlideHighestSeconds}
                            disabled={!entryGlideEnabled}
                            onChange={(event) => setEntryGlideHighestSeconds(Number(event.target.value))}
                            onReset={() => setEntryGlideHighestSeconds(DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS)}
                            aria-label="Highest tone entry glide seconds"
                            className="h-1.5 w-full accent-fuchsia-300"
                          />
                          <span className="text-right text-xs tabular-nums text-white/70">
                            {entryGlideHighestSeconds.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.16em] text-white/60">Master gain</span>
                    <span className="text-xs tabular-nums text-white/70">{masterGainDb.toFixed(1)} dB</span>
                  </div>
                  <ResettableRangeInput
                    min={-30}
                    max={0}
                    step={0.1}
                    value={masterGainDb}
                    onChange={(event) => setMasterGainDb(Number(event.target.value))}
                    onReset={() => setMasterGainDb(DEFAULT_MASTER_GAIN_DB)}
                    aria-label="Master gain. Double-click or double-tap to reset to default."
                    className="h-1.5 w-full accent-fuchsia-300"
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Tone mixer">
              <ToneMixer
                tones={toneMixerTones}
                allTones={tonesInToneSet}
                onToneGain={setToneGain}
                onTonePan={setTonePan}
                onToneDetune={setToneDetune}
                onToggleToneSolo={toggleToneSoloForNote}
                onEditOvertones={(noteId) => {
                  overtoneSelectionPinnedRef.current = true
                  setSelectedOvertoneNoteId(noteId)
                  setActiveTab('overtones')
                }}
              />
            </SectionCard>
          </div>
          <div
            className="space-y-4 landscape:space-y-2 landscape:pt-0 max-h-[500px]:space-y-2 max-h-[500px]:pt-0"
            role="tabpanel"
            id="panel-overtones"
            aria-labelledby="tab-overtones"
            hidden={activeTab !== 'overtones'}
          >
            <div className="landscape:flex landscape:items-end landscape:gap-2 max-h-[500px]:flex max-h-[500px]:items-end max-h-[500px]:gap-2">
            <SectionCard
              title="Overtones"
              titleAddon={
                <button
                  type="button"
                  className={`button-safe flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
                    globalOvertoneEditEnabled
                      ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
                      : 'border-white/15 bg-white/5 text-white/80 opacity-40 hover:bg-white/10'
                  }`}
                  onClick={toggleGlobalOvertoneEdit}
                  title="Global overtone edit"
                  aria-label="Toggle global overtone edit"
                  aria-pressed={globalOvertoneEditEnabled}
                >
                  <Globe size={14} aria-hidden />
                </button>
              }
              className="landscape:min-w-0 landscape:flex-1 landscape:p-2 landscape:[&>header]:hidden max-h-[500px]:min-w-0 max-h-[500px]:flex-1 max-h-[500px]:p-2 max-h-[500px]:[&>header]:hidden [&>header]:mb-2"
              rightSlot={
                <div className="flex w-full min-w-0 flex-col items-end gap-1.5 landscape:hidden max-h-[500px]:hidden">
                  <div className="flex items-center gap-2">
                    <OvertoneAllSoloButton
                      variant="portrait-solo"
                      isActive={isAllTonesCompareActive}
                      onClick={toggleAllTonesCompare}
                    />
                    <OvertoneToneNavControls
                      variant="portrait-solo"
                      toneNoteId={selectedOvertoneNoteId}
                      isSolo={isSelectedOvertoneToneSolo}
                      canNavigate={canNavigateOvertoneTone}
                      soloAriaLabel={selectedOvertoneToneSoloAriaLabel}
                      onToggleSolo={toggleSelectedOvertoneToneSolo}
                      onPrevious={() => selectAdjacentOvertoneTone('previous')}
                      onNext={() => selectAdjacentOvertoneTone('next')}
                    />
                  </div>
                  <div className="hide-scrollbar -mx-0.5 flex overflow-x-auto">
                    <div className="flex min-w-full items-center justify-between gap-9 px-0.5">
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className={overtoneIconButtonClass('portrait-solo')}
                          onClick={saveOvertoneToActivePreset}
                          aria-label="Save overtone changes to current preset"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          type="button"
                          className={overtoneIconButtonClass('portrait-solo')}
                          onClick={resetOvertoneBalance}
                          aria-label="Reset overtone balance"
                          disabled={!canResetOvertones}
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          type="button"
                          className={overtoneIconButtonClass('portrait-solo')}
                          onClick={undoOvertoneChange}
                          aria-label="Undo overtone change"
                          disabled={!canUndoOvertones}
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          type="button"
                          className={overtoneIconButtonClass('portrait-solo')}
                          onClick={redoOvertoneChange}
                          aria-label="Redo overtone change"
                          disabled={!canRedoOvertones}
                        >
                          <Redo2 size={16} />
                        </button>
                      </div>
                      <OvertoneToneNavControls
                        variant="portrait-steps"
                        toneNoteId={selectedOvertoneNoteId}
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
                timbreBlend={selectedOvertoneTimbreBlend}
                harmonicTimbreEnabled={harmonicTimbreEnabled}
                onGainChange={overtoneMidi.onPartialGainFromUi}
                onGainDragStart={rememberOvertoneState}
                onToggleEnabled={(partialId, enabled) => {
                  rememberOvertoneState()
                  overtoneMidi.onPartialEnabledFromUi(partialId, enabled)
                }}
              />
              <div className="mt-2 flex items-center gap-1 landscape:hidden max-h-[500px]:hidden">
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={overtoneIconButtonClass('portrait-solo')}
                    onClick={copySelectedOvertones}
                    aria-label="Copy tone overtones"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('portrait-solo')}
                    onClick={pasteSelectedOvertones}
                    aria-label="Paste tone overtones"
                    disabled={!canPasteOvertones}
                  >
                    <ClipboardPaste size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('portrait-solo')}
                    onClick={deactivateAllPartials}
                    aria-label="Deactivate all partials"
                    disabled={!canDeactivateAllPartials}
                  >
                    <PowerOff size={16} />
                  </button>
                  <HarmonicTimbreToggleButton
                    variant="portrait-solo"
                    enabled={harmonicTimbreEnabled}
                    onClick={toggleHarmonicTimbreEnabled}
                  />
                </div>
                <button
                  type="button"
                  className={`button-safe ml-auto flex shrink-0 touch-manipulation items-center gap-1 rounded-lg border border-white/15 bg-white/5 text-xs font-semibold text-white/85 transition hover:bg-white/10 ${overtoneControlButtonSizeClass('portrait-solo')}`}
                  onClick={() => overtoneAnalyzeInputRef.current?.click()}
                  aria-label="Choose audio file for overtone analysis"
                >
                  <AudioWaveform size={16} />
                  Analyse audio
                </button>
              </div>
            </SectionCard>
            <div className="hidden shrink-0 landscape:block max-h-[500px]:block">
              <TimbreMorphSlider
                orientation="vertical"
                timbreBlend={selectedOvertoneTimbreBlend}
                onSetTimbreValue={setSelectedOvertoneTimbreValue}
                onTimbreChangeStart={beginTimbreMorphChange}
                onTimbreChangeEnd={endTimbreMorphChange}
              />
            </div>
            </div>
            <SectionCard title="Partials & timbre">
              <PartialEditor
                partials={selectedOvertonePartials}
                referenceFrequencyHz={partialReferenceFrequencyHz}
                timbreBlend={selectedOvertoneTimbreBlend}
                onSetPartialEnabled={overtoneMidi.onPartialEnabledFromUi}
                onSetPartialRatio={setSelectedOvertoneRatio}
                onSetPartialGain={overtoneMidi.onPartialGainFromUi}
                onAddPartial={addSelectedOvertonePartial}
                onRemovePartial={removeSelectedOvertonePartial}
                onSetTimbreValue={setSelectedOvertoneTimbreValue}
                onTimbreChangeStart={beginTimbreMorphChange}
                onTimbreChangeEnd={endTimbreMorphChange}
              />
            </SectionCard>
          </div>
          <div
            className="space-y-4 landscape:space-y-2 max-h-[500px]:space-y-2"
            role="tabpanel"
            id="panel-metronome"
            aria-labelledby="tab-metronome"
            hidden={activeTab !== 'metronome'}
          >
            <SectionCard title="Click" className="[&>header]:mb-0">
              <MetronomeControls
                enabled={metronomeEnabled}
                bpm={metronomeBpm}
                volumeDb={metronomeVolumeDb}
                onEnabledChange={handleMetronomeEnabledChange}
                onBpmChange={setMetronomeBpm}
                onVolumeChange={setMetronomeVolumeDb}
              />
            </SectionCard>
          </div>
          <div
            className="space-y-4 landscape:space-y-2 max-h-[500px]:space-y-2"
            role="tabpanel"
            id="panel-presets"
            aria-labelledby="tab-presets"
            hidden={activeTab !== 'presets'}
          >
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
                onSavePreset={saveActivePreset}
                onRenamePreset={renamePreset}
                onDuplicatePreset={duplicatePreset}
                onDeletePreset={deletePreset}
                onMovePreset={movePreset}
              />
            </SectionCard>
          </div>
          <div
            className="space-y-4 landscape:space-y-2 max-h-[500px]:space-y-2"
            role="tabpanel"
            id="panel-midi"
            aria-labelledby="tab-midi"
            hidden={activeTab !== 'midi'}
          >
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
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-2">
        <div className="mx-auto w-full max-w-[26.5rem] space-y-0 landscape:max-w-none max-h-[500px]:max-w-none md:max-w-[62.5rem]">
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
                  className={`button-safe shrink-0 rounded-lg border px-3 py-2 text-center text-sm font-medium transition landscape:hidden max-h-[500px]:hidden ${activeTab === id ? 'border-white/25 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                </button>
              ))}
              {activeTab === 'overtones' && (
                <div className="hidden w-full min-w-0 items-center gap-1.5 landscape:flex max-h-[500px]:flex">
                  <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={saveOvertoneToActivePreset}
                    aria-label="Save overtone changes to current preset"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={resetOvertoneBalance}
                    aria-label="Reset overtone balance"
                    disabled={!canResetOvertones}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={undoOvertoneChange}
                    aria-label="Undo overtone change"
                    disabled={!canUndoOvertones}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={redoOvertoneChange}
                    aria-label="Redo overtone change"
                    disabled={!canRedoOvertones}
                  >
                    <Redo2 size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={copySelectedOvertones}
                    aria-label="Copy tone overtones"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={pasteSelectedOvertones}
                    aria-label="Paste tone overtones"
                    disabled={!canPasteOvertones}
                  >
                    <ClipboardPaste size={16} />
                  </button>
                  <button
                    type="button"
                    className={overtoneIconButtonClass('landscape-inline')}
                    onClick={deactivateAllPartials}
                    aria-label="Deactivate all partials"
                    disabled={!canDeactivateAllPartials}
                  >
                    <PowerOff size={16} />
                  </button>
                  <HarmonicTimbreToggleButton
                    variant="landscape-inline"
                    enabled={harmonicTimbreEnabled}
                    onClick={toggleHarmonicTimbreEnabled}
                  />
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <OvertoneAllSoloButton
                    variant="landscape-inline"
                    isActive={isAllTonesCompareActive}
                    onClick={toggleAllTonesCompare}
                  />
                  <OvertoneToneNavControls
                    variant="landscape-inline"
                    toneNoteId={selectedOvertoneNoteId}
                    isSolo={isSelectedOvertoneToneSolo}
                    canNavigate={canNavigateOvertoneTone}
                    soloAriaLabel={selectedOvertoneToneSoloAriaLabel}
                    onToggleSolo={toggleSelectedOvertoneToneSolo}
                    onPrevious={() => selectAdjacentOvertoneTone('previous')}
                    onNext={() => selectAdjacentOvertoneTone('next')}
                  />
                  </div>
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
                className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => setMenuExportOpen((current) => !current)}
                aria-expanded={menuExportOpen}
                aria-controls="menu-export-actions"
              >
                <span className="flex items-center gap-2">
                  <Upload size={20} />
                  Export
                </span>
                <ChevronDown size={16} className={menuExportOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {menuExportOpen ? (
                <div id="menu-export-actions" className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      exportCurrentSong()
                      setMenuOpen(false)
                    }}
                  >
                    <Upload size={16} />
                    Export song JSON
                  </button>
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      exportSongLibrary()
                      setMenuOpen(false)
                    }}
                  >
                    <Upload size={16} />
                    Export song library JSON
                  </button>
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      exportCurrentToneSet()
                      setMenuOpen(false)
                    }}
                  >
                    <Upload size={16} />
                    Export tone set JSON
                  </button>
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      exportGlobalData()
                      setMenuOpen(false)
                    }}
                  >
                    <Upload size={16} />
                    Global export (all data)
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
                onClick={() => setMenuImportOpen((current) => !current)}
                aria-expanded={menuImportOpen}
                aria-controls="menu-import-actions"
              >
                <span className="flex items-center gap-2">
                  <Download size={20} />
                  Import
                </span>
                <ChevronDown size={16} className={menuImportOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {menuImportOpen ? (
                <div id="menu-import-actions" className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      importInputRef.current?.click()
                      setMenuOpen(false)
                    }}
                  >
                    <Download size={16} />
                    Import song / library JSON
                  </button>
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      toneSetImportInputRef.current?.click()
                      setMenuOpen(false)
                    }}
                  >
                    <Download size={16} />
                    Import tone set JSON
                  </button>
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                    onClick={() => {
                      globalImportInputRef.current?.click()
                      setMenuOpen(false)
                    }}
                  >
                    <Download size={16} />
                    Global import (all data)
                  </button>
                </div>
              ) : null}
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
                onClick={openToneSetOptions}
              >
                <Menu size={20} />
                Tone set: {toneSetLayout.name}
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
        ref={toneSetImportInputRef}
        type="file"
        accept=".json,.tone-set.json,application/json"
        className="hidden"
        onChange={(event) => {
          void importToneSetFromFile(event)
        }}
      />
      <input
        ref={toneSetEditorImportInputRef}
        type="file"
        accept=".json,.tone-set.json,application/json"
        className="hidden"
        onChange={(event) => {
          void importToneSetIntoEditorFromFile(event)
        }}
      />
      <input
        ref={globalImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void importGlobalData(event)
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
      {toneSetEditorOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tone-set-editor-title"
            className="w-full max-w-lg rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="tone-set-editor-title" className="text-sm font-semibold text-white">
                  Tone set custom JSON
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  Edit or paste tone set: 2 subOctaveIds and 16 gridIds.
                </p>
              </div>
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
                onClick={() => setToneSetEditorOpen(false)}
                aria-label="Close tone set editor"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/60">Simple editor</div>
              <div className="grid gap-2">
                <input
                  type="text"
                  value={toneSetQuickName}
                  onChange={(event) => {
                    const next = event.target.value
                    setToneSetQuickName(next)
                    syncDraftFromQuickEditor(next, toneSetQuickGrid)
                  }}
                  placeholder="Tone set name"
                  className="w-full rounded-md border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
                />
                <textarea
                  value={toneSetQuickGrid}
                  onChange={(event) => {
                    const next = event.target.value
                    setToneSetQuickGrid(next)
                    syncDraftFromQuickEditor(toneSetQuickName, next)
                  }}
                  placeholder="All tones (e.g. g0, a0, c, d, e, f, fis...)"
                  rows={3}
                  className="w-full resize-y rounded-md border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
                />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <button
                type="button"
                className="button-safe flex min-h-[34px] w-full items-center justify-between rounded-md border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-xs uppercase tracking-[0.14em] text-white/70 transition hover:bg-[#252332]"
                onClick={() => setToneSetJsonCollapsed((current) => !current)}
                aria-expanded={!toneSetJsonCollapsed}
                aria-controls="tone-set-json-editor"
              >
                <span>JSON editor</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${toneSetJsonCollapsed ? '' : 'rotate-180'}`}
                />
              </button>
              {!toneSetJsonCollapsed ? (
                <div id="tone-set-json-editor" className="mt-3">
                  <textarea
                    value={toneSetEditorDraft}
                    onChange={(event) => {
                      setToneSetEditorDraft(event.target.value)
                      if (toneSetEditorError) {
                        setToneSetEditorError(null)
                      }
                    }}
                    className="min-h-[220px] w-full rounded-lg border border-white/15 bg-[#1b1827] p-3 font-mono text-xs text-white/90 outline-none focus:border-fuchsia-300/50"
                    spellCheck={false}
                    aria-label="Tone set JSON"
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-white/55">
                    Allowed tone symbols: G0..D2 chromatic range. Accepted forms include plain names
                    (<code className="rounded bg-white/10 px-1">g0</code>, <code className="rounded bg-white/10 px-1">a1</code>,
                    <code className="rounded bg-white/10 px-1">d2</code>) and accidentals with sharps/flats
                    (<code className="rounded bg-white/10 px-1">g#1</code>, <code className="rounded bg-white/10 px-1">ab1</code>,
                    <code className="rounded bg-white/10 px-1">db2</code>, also <code className="rounded bg-white/10 px-1">♯</code>/<code className="rounded bg-white/10 px-1">♭</code>).
                  </p>
                </div>
              ) : null}
            </div>
            {toneSetEditorError ? (
              <p className="mt-2 text-xs text-red-200">{toneSetEditorError}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="button-safe min-h-[44px] flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={() => setToneSetEditorOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={saveAndApplyCustomToneSet}
                aria-label="Save custom tone set"
                title="Save"
              >
                <Save size={18} />
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={() => toneSetEditorImportInputRef.current?.click()}
                aria-label="Import tone set JSON into editor"
                title="Import JSON"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={saveCustomToneSetFile}
                aria-label="Export custom tone set JSON"
                title="Export JSON"
              >
                <Upload size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      {toneSetOptionsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tone-set-options-title"
            className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="tone-set-options-title" className="text-sm font-semibold text-white">
                  Tone set options
                </h2>
              </div>
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
                onClick={() => setToneSetOptionsOpen(false)}
                aria-label="Close tone set options"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="button-safe min-h-[44px] w-full rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-fuchsia-300/25"
                onClick={() => {
                  setDefaultToneSet()
                  setToneSetOptionsOpen(false)
                }}
              >
                Default (Eesti Torupill)
              </button>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-white/55">Custom set</span>
                <select
                  className="w-full rounded-lg border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
                  value={selectedCustomToneSetName}
                  onChange={(event) => {
                    const nextName = event.target.value
                    setSelectedCustomToneSetName(nextName)
                    if (!nextName) {
                      return
                    }
                    loadSavedToneSetFromBrowser(nextName)
                    setToneSetOptionsOpen(false)
                  }}
                >
                  {customToneSets.length === 0 ? (
                    <option value="">No custom sets saved</option>
                  ) : (
                    customToneSets.map((setEntry) => (
                      <option key={setEntry.name} value={setEntry.name}>
                        {setEntry.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                type="button"
                className="button-safe min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-left text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={loadCustomToneSet}
              >
                Edit
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] w-full rounded-lg border border-red-300/40 bg-red-300/10 px-4 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-300/20"
                onClick={deleteSavedToneSetFromBrowser}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingOvertoneAnalysis && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overtone-analysis-dialog-title"
            className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="overtone-analysis-dialog-title" className="text-sm font-semibold text-white">
                  Apply analysis
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  Choose how to apply overtone ratios.
                </p>
              </div>
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
                onClick={() => setPendingOvertoneAnalysis(null)}
                aria-label="Dismiss analysis"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="button-safe min-h-[44px] rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-300/25"
                onClick={() => applyPendingOvertoneAnalysis('gain-integer-ratios')}
              >
                Gain + integer ratios (1, 2, 3…)
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={() => applyPendingOvertoneAnalysis('gain-ratios')}
              >
                Gain + measured ratios
              </button>
              <button
                type="button"
                className="button-safe min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                onClick={() => applyPendingOvertoneAnalysis('gain-only')}
              >
                Gain only
              </button>
            </div>
          </div>
        </div>
      )}
      {overtoneAnalysisError && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="overtone-analysis-error-title"
            className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
          >
            <h2 id="overtone-analysis-error-title" className="text-sm font-semibold text-white">
              Analysis failed
            </h2>
            <p className="mt-2 text-sm text-white/70">{overtoneAnalysisError}</p>
            <button
              type="button"
              className="button-safe mt-4 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              onClick={() => setOvertoneAnalysisError(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
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
