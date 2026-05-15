import {
  AudioWaveform,
  BatteryMedium,
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
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { droneEngine } from './audio/DroneEngine'
import { analyzeWavOvertones } from './audio/overtoneAnalysis'
import type { DroneRuntimeConfig, PartialConfig } from './audio/types'
import { MetronomeControls } from './components/MetronomeControls'
import { NoteSelector } from './components/NoteSelector'
import { OvertoneBars } from './components/OvertoneBars'
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
import type { NoteId } from './music/notes'
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
const APP_VERSION = '1.1'
const MAX_OVERTONE_HISTORY = 60
const SONG_MENU_TRIGGER_CLASS =
  'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-[#252332] px-3 py-2 text-sm text-white/90 transition hover:bg-[#2f2d3c]'
function isIosStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return isIosDevice && isStandalone
}

function isKeyboardEligibleElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) {
    return true
  }
  if (!(target instanceof HTMLInputElement)) {
    return false
  }
  const blockedTypes = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ])
  return !blockedTypes.has(target.type)
}

function focusWithIosKeyboard(target: HTMLInputElement | HTMLTextAreaElement): void {
  const tempInput = document.createElement('input')
  const rect = target.getBoundingClientRect()
  tempInput.type = 'text'
  tempInput.setAttribute('aria-hidden', 'true')
  tempInput.tabIndex = -1
  tempInput.style.position = 'fixed'
  tempInput.style.top = `${Math.max(0, rect.top)}px`
  tempInput.style.left = `${Math.max(0, rect.left)}px`
  tempInput.style.width = '1px'
  tempInput.style.height = '1px'
  tempInput.style.opacity = '0'
  tempInput.style.pointerEvents = 'none'
  document.body.appendChild(tempInput)
  tempInput.focus()
  window.setTimeout(() => {
    target.focus()
    target.click()
    tempInput.remove()
  }, 0)
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('tone')
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }),
  )
  const upPressTimeoutRef = useRef<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const overtoneAnalyzeInputRef = useRef<HTMLInputElement | null>(null)
  const sideMenuRef = useRef<HTMLElement | null>(null)
  const mediaAnchorRef = useRef<HTMLAudioElement | null>(null)
  const overtoneUndoRef = useRef<PartialConfig[][]>([])
  const overtoneRedoRef = useRef<PartialConfig[][]>([])
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
  const setPartialEnabled = useDroneStore((state) => state.setPartialEnabled)
  const setPartials = useDroneStore((state) => state.setPartials)
  const setPartialRatio = useDroneStore((state) => state.setPartialRatio)
  const setPartialGain = useDroneStore((state) => state.setPartialGain)
  const addPartial = useDroneStore((state) => state.addPartial)
  const removePartial = useDroneStore((state) => state.removePartial)
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
  const loadSongFromLibrary = useDroneStore((state) => state.loadSongFromLibrary)
  const deleteSongFromLibrary = useDroneStore((state) => state.deleteSongFromLibrary)
  const moveSongInLibrary = useDroneStore((state) => state.moveSongInLibrary)
  const saveCurrentSongToLibrary = useDroneStore((state) => state.saveCurrentSongToLibrary)
  const selectNextPreset = useDroneStore((state) => state.selectNextPreset)
  const selectPreviousPreset = useDroneStore((state) => state.selectPreviousPreset)

  const overtoneMidi = useOvertoneMidi({
    partials,
    setPartialGain,
    setPartialEnabled,
  })

  const clonePartials = useCallback(
    (source: PartialConfig[]) => source.map((partial) => ({ ...partial })),
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

  const rememberOvertoneState = useCallback(() => {
    const snapshot = clonePartials(useDroneStore.getState().partials)
    const currentTop = overtoneUndoRef.current[overtoneUndoRef.current.length - 1]
    if (currentTop && samePartials(currentTop, snapshot)) {
      return
    }
    overtoneUndoRef.current.push(snapshot)
    if (overtoneUndoRef.current.length > MAX_OVERTONE_HISTORY) {
      overtoneUndoRef.current.shift()
    }
    overtoneRedoRef.current = []
    setOvertoneHistoryVersion((value) => value + 1)
  }, [clonePartials, samePartials])

  const undoOvertoneChange = useCallback(() => {
    const previous = overtoneUndoRef.current.pop()
    if (!previous) {
      return
    }
    overtoneRedoRef.current.push(clonePartials(useDroneStore.getState().partials))
    setPartials(previous)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [clonePartials, setPartials])

  const redoOvertoneChange = useCallback(() => {
    const next = overtoneRedoRef.current.pop()
    if (!next) {
      return
    }
    overtoneUndoRef.current.push(clonePartials(useDroneStore.getState().partials))
    setPartials(next)
    setOvertoneHistoryVersion((value) => value + 1)
  }, [clonePartials, setPartials])

  const canUndoOvertones = overtoneUndoRef.current.length > 0
  const canRedoOvertones = overtoneRedoRef.current.length > 0

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
    const safeName =
      resolvedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'song'
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.song.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [activePresetId, presets, songName])

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
    [importSong],
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
    const current = useDroneStore.getState().partials
    const resetTarget = buildResetOvertoneBalance(current)
    if (samePartials(current, resetTarget)) {
      return
    }
    rememberOvertoneState()
    setPartials(resetTarget)
  }, [buildResetOvertoneBalance, rememberOvertoneState, samePartials, setPartials])

  const canResetOvertones = useMemo(() => {
    const resetTarget = buildResetOvertoneBalance(partials)
    return !samePartials(partials, resetTarget)
  }, [buildResetOvertoneBalance, partials, samePartials])

  const analyzeOvertoneBalanceFromFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      try {
        const analysis = await analyzeWavOvertones(file, partials.length)
        const includeRatios = window.confirm(
          'Include overtone ratio analysis too? Press Cancel to update only balance (gain/mute).',
        )
        const presetNameFromFile = file.name.replace(/\.[^/.]+$/, '').trim() || 'Analyzed WAV'
        const current = useDroneStore.getState().partials
        const analyzed = current.map((partial, index) => {
          const gainDb = analysis.gainsDb[index] ?? -48
          return {
            ...partial,
            ratio: includeRatios ? (analysis.ratios[index] ?? partial.ratio) : partial.ratio,
            gainDb,
            enabled: gainDb > -47.5,
          }
        })
        setPartials(analyzed)
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
    [partials.length, renamePreset, saveAsPreset, setPartials],
  )

  const openJblPortableApp = useCallback(() => {
    // Best effort deep-link. Works only if JBL registers this URL scheme.
    window.location.href = 'jblportable://'
  }, [])

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
  const partialReferenceFrequencyHz = useMemo(() => {
    const sourceTones = activeTones.length > 0 ? activeTones : tones
    if (sourceTones.length === 0) {
      return null
    }
    const sum = sourceTones.reduce((acc, tone) => {
      return (
        acc +
        getFrequency(
          tone.noteId,
          tuningSystemId,
          tonalCenter,
          referenceA4Hz,
          baseOctave,
        )
      )
    }, 0)
    return sum / sourceTones.length
  }, [activeTones, baseOctave, referenceA4Hz, tonalCenter, tones, tuningSystemId])
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
    overtoneUndoRef.current = []
    overtoneRedoRef.current = []
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
    if (!isIosStandalone()) {
      return
    }

    const onTouchEnd = (event: TouchEvent) => {
      const target = event.target
      if (!isKeyboardEligibleElement(target)) {
        return
      }
      if (document.activeElement === target) {
        return
      }
      focusWithIosKeyboard(target)
    }

    document.addEventListener('touchend', onTouchEnd, { capture: true })
    return () => {
      document.removeEventListener('touchend', onTouchEnd, { capture: true })
    }
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [])

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
  return (
    <div
      className={`relative min-h-screen bg-[#111019] text-[#f2f2f7] ${
        activeTab === 'metronome' ? 'h-screen overflow-hidden' : ''
      }`}
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
          <h1 className="text-xl font-semibold tracking-wide">Drone</h1>
          <div className="ml-auto text-4xl font-extrabold leading-none text-fuchsia-100">{currentTime}</div>
        </header>

        <main
          className={`landscape:pb-2 max-h-[500px]:pb-2 ${
            activeTab === 'blank' ? 'pb-20' : activeTab === 'metronome' ? 'pb-32' : 'pb-44'
          }`}
        >
          <div className="space-y-4" role="tabpanel" id="panel-tone" aria-labelledby="tab-tone" hidden={activeTab !== 'tone'}>
            <div className="sticky top-[68px] z-20 -mx-3 grid grid-cols-2 gap-2 overflow-visible bg-[#111019] px-3 pb-2 landscape:top-2 max-h-[500px]:top-2">
              <article className="relative rounded-xl border border-fuchsia-300/45 bg-[#211a2d]">
                <button
                  type="button"
                  className="block min-h-full w-full rounded-xl p-3 pr-12 text-left transition hover:bg-fuchsia-300/10"
                  onClick={() => setActiveTab('presets')}
                  aria-label="Open presets"
                >
                  <div className="min-w-0">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                      Preset
                    </h2>
                    <p className="mt-1 truncate text-sm font-semibold text-white/90">
                      {presets.find((preset) => preset.id === activePresetId)?.name ?? 'Preset'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  className="button-safe absolute right-3 top-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
                  onClick={saveActivePreset}
                  aria-label="Save current preset"
                >
                  <Save size={15} />
                </button>
              </article>
              <article className="min-w-0 overflow-visible rounded-xl border border-white/10 bg-[#1a1825] p-3">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                  Song
                </h2>
                <SongLibraryMenu
                  songName={songName}
                  songLibrary={songLibrary}
                  onSaveCurrentSong={saveCurrentSongToLibrary}
                  onLoadSong={loadSongFromLibrary}
                  onMoveSong={moveSongInLibrary}
                  onDeleteSong={deleteSongFromLibrary}
                  triggerClassName={SONG_MENU_TRIGGER_CLASS}
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
                onToneGain={setToneGain}
                onTonePan={setTonePan}
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
              title="Overtone balance"
              className="landscape:p-2 landscape:[&>header]:hidden max-h-[500px]:p-2 max-h-[500px]:[&>header]:hidden"
              rightSlot={
                <div className="flex items-center gap-2 landscape:hidden max-h-[500px]:hidden">
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
              }
            >
              <OvertoneBars
                partials={partials}
                onGainChange={overtoneMidi.onPartialGainFromUi}
                onGainDragStart={rememberOvertoneState}
                onToggleEnabled={(partialId, enabled) => {
                  rememberOvertoneState()
                  overtoneMidi.onPartialEnabledFromUi(partialId, enabled)
                }}
              />
              <div className="mt-2 flex justify-end">
                <div className="flex items-center">
                  <button
                    type="button"
                    className="button-safe flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
                    onClick={() => overtoneAnalyzeInputRef.current?.click()}
                    aria-label="Choose audio file for overtone analysis"
                  >
                    <AudioWaveform size={16} />
                    Analyse audio
                  </button>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Partials & timbre">
              <PartialEditor
                partials={partials}
                referenceFrequencyHz={partialReferenceFrequencyHz}
                timbreBlend={timbreBlend}
                onSetPartialEnabled={overtoneMidi.onPartialEnabledFromUi}
                onSetPartialRatio={setPartialRatio}
                onSetPartialGain={overtoneMidi.onPartialGainFromUi}
                onAddPartial={addPartial}
                onRemovePartial={removePartial}
                onSetTimbreValue={setTimbreValue}
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
      <div className="fixed bottom-2 left-0 right-0 z-30 px-3">
        <div className="mx-auto w-full max-w-md space-y-2 landscape:max-w-none max-h-[500px]:max-w-none md:max-w-5xl">
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
                <div className="ml-2 hidden items-center gap-1.5 landscape:flex max-h-[500px]:flex">
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
                Import song
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
}

export default App
