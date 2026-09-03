import { useCallback, useEffect, useRef, useState } from 'react'
import { shineEngine, SHINE_HARMONIC_COUNT } from '../audio/ShineEngine'
import { useDroneStore } from '../store/useDroneStore'
import {
  DEFAULT_SHINE_OCTAVE_INDEX,
  DEFAULT_SHINE_VOLUME,
} from '../presets/defaultPresets'

export const SHINE_OCTAVE_LABELS = ['0', '1', '2', '3', '4'] as const

export { DEFAULT_SHINE_OCTAVE_INDEX, DEFAULT_SHINE_VOLUME }

const METER_UPDATE_MS = 40
/** Shine fade-in is slower than the tone/drone fade-in from the Fade card. */
const SHINE_FADE_IN_MULTIPLIER = 2

function baseFrequency(noteIndex: number, octaveIndex: number, a4Hz: number): number {
  const midi = 12 * (octaveIndex + 1) + noteIndex
  return a4Hz * 2 ** ((midi - 69) / 12)
}

function idleDisplayLevels(levels: number[], autos: boolean[]): number[] {
  return levels.map((level, index) => (autos[index] ? 0 : level))
}

export type ShineState = {
  enabled: boolean
  running: boolean
  levels: number[]
  autos: boolean[]
  bumps: boolean[]
  displayLevels: number[]
  volume: number
  octaveIndex: number
  toggleRunning: () => void
  setLevel: (index: number, level: number) => void
  setAuto: (index: number, on: boolean) => void
  setBumps: (index: number, on: boolean) => void
  allOn: () => void
  allOff: () => void
  setAllAuto: (on: boolean) => void
  setAllBumps: (on: boolean) => void
  setVolume: (volume: number) => void
  setOctaveIndex: (index: number) => void
}

const zeros = () => new Array<number>(SHINE_HARMONIC_COUNT).fill(0)

export function useShine(
  a4Hz: number,
  noteIndex: number,
  masterGainDb: number,
  playing: boolean,
): ShineState {
  const shine = useDroneStore((state) => state.shine)
  const setShine = useDroneStore((state) => state.setShine)
  const activePresetId = useDroneStore((state) => state.activePresetId)
  const playbackFadeEnabled = useDroneStore((state) => state.playbackFadeEnabled)
  const playbackFadeInSeconds = useDroneStore((state) => state.playbackFadeInSeconds)
  const playbackFadeOutSeconds = useDroneStore((state) => state.playbackFadeOutSeconds)
  const presetCrossfadeSeconds = useDroneStore((state) => state.presetCrossfadeSeconds)
  const { enabled, levels, autos, bumps, volume, octaveIndex } = shine

  const isActive = enabled && playing

  const [displayLevels, setDisplayLevels] = useState<number[]>(() =>
    idleDisplayLevels(shine.levels, shine.autos),
  )

  const rafRef = useRef<number | null>(null)
  const lastMeterUpdateRef = useRef(0)
  const previousPresetIdRef = useRef(activePresetId)
  const previousShineEnabledRef = useRef(enabled)

  useEffect(() => {
    shineEngine.setPlaybackFadeSettings(
      playbackFadeEnabled ? playbackFadeInSeconds * SHINE_FADE_IN_MULTIPLIER : 0,
      playbackFadeEnabled ? playbackFadeOutSeconds : 0,
      playbackFadeEnabled ? presetCrossfadeSeconds : 0,
    )
  }, [
    playbackFadeEnabled,
    playbackFadeInSeconds,
    playbackFadeOutSeconds,
    presetCrossfadeSeconds,
  ])

  useEffect(() => {
    if (previousPresetIdRef.current !== activePresetId) {
      shineEngine.markPresetTransition()
      previousPresetIdRef.current = activePresetId
    }
  }, [activePresetId])

  const applyEngineConfig = useCallback(() => {
    shineEngine.setBaseFrequency(baseFrequency(noteIndex, octaveIndex, a4Hz))
    shineEngine.setMasterGainDb(masterGainDb)
    levels.forEach((level, index) => shineEngine.setHarmonicLevel(index, level))
    autos.forEach((on, index) => shineEngine.setHarmonicAuto(index, on))
    bumps.forEach((on, index) => shineEngine.setHarmonicBumps(index, on))
    shineEngine.setVolume(volume)
  }, [a4Hz, autos, bumps, levels, masterGainDb, noteIndex, octaveIndex, volume])

  useEffect(() => {
    if (!isActive) {
      shineEngine.clearPresetTransition()
      applyEngineConfig()
      previousShineEnabledRef.current = enabled
      shineEngine.stop()
      return
    }

    void shineEngine.resume()

    const shineWasEnabled = previousShineEnabledRef.current
    previousShineEnabledRef.current = enabled

    const isPresetTransition = shineEngine.consumePresetTransition()
    const shineAppearingOnPreset = isPresetTransition && enabled && !shineWasEnabled
    const shouldCrossfade =
      isPresetTransition && shineWasEnabled && enabled && shineEngine.isPlaying()

    if (shouldCrossfade) {
      shineEngine.crossfadePresetApply(applyEngineConfig)
    } else if (!shineEngine.isPlaying() || shineAppearingOnPreset) {
      applyEngineConfig()
      const fadeInSeconds =
        shineAppearingOnPreset && playbackFadeEnabled
          ? Math.max(
              playbackFadeInSeconds * SHINE_FADE_IN_MULTIPLIER,
              presetCrossfadeSeconds * SHINE_FADE_IN_MULTIPLIER,
            )
          : undefined
      shineEngine.start({
        force: shineAppearingOnPreset && shineEngine.isRunning(),
        fadeInSeconds,
      })
    } else {
      applyEngineConfig()
    }

    setDisplayLevels(shineEngine.getDisplayLevels())
  }, [
    applyEngineConfig,
    enabled,
    isActive,
    playbackFadeEnabled,
    playbackFadeInSeconds,
    presetCrossfadeSeconds,
  ])

  useEffect(() => {
    if (!isActive && !shineEngine.isRunning()) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setDisplayLevels(idleDisplayLevels(levels, autos))
      return
    }

    lastMeterUpdateRef.current = 0
    const tick = () => {
      if (!isActive && !shineEngine.isRunning()) {
        rafRef.current = null
        setDisplayLevels(idleDisplayLevels(levels, autos))
        return
      }
      const now = performance.now()
      if (now - lastMeterUpdateRef.current >= METER_UPDATE_MS) {
        lastMeterUpdateRef.current = now
        setDisplayLevels(shineEngine.getDisplayLevels())
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isActive, levels, autos])

  useEffect(() => {
    return () => {
      shineEngine.stop()
    }
  }, [])

  const toggleRunning = useCallback(() => {
    const current = useDroneStore.getState().shine
    setShine({ ...current, enabled: !current.enabled })
  }, [setShine])

  const setLevel = useCallback(
    (index: number, level: number) => {
      const current = useDroneStore.getState().shine
      const next = current.levels.slice()
      next[index] = level
      setShine({ ...current, levels: next })
    },
    [setShine],
  )

  const setAuto = useCallback(
    (index: number, on: boolean) => {
      const current = useDroneStore.getState().shine
      const nextAutos = current.autos.slice()
      nextAutos[index] = on
      const nextBumps = current.bumps
      if (!on && nextBumps[index]) {
        const cleared = nextBumps.slice()
        cleared[index] = false
        setShine({ ...current, autos: nextAutos, bumps: cleared })
        return
      }
      setShine({ ...current, autos: nextAutos })
    },
    [setShine],
  )

  const setBumps = useCallback(
    (index: number, on: boolean) => {
      const current = useDroneStore.getState().shine
      const next = current.bumps.slice()
      next[index] = on
      setShine({ ...current, bumps: next })
    },
    [setShine],
  )

  const allOn = useCallback(() => {
    const current = useDroneStore.getState().shine
    setShine({ ...current, levels: new Array<number>(SHINE_HARMONIC_COUNT).fill(0.6) })
  }, [setShine])

  const allOff = useCallback(() => {
    const current = useDroneStore.getState().shine
    setShine({ ...current, levels: zeros() })
  }, [setShine])

  const setAllAuto = useCallback(
    (on: boolean) => {
      const current = useDroneStore.getState().shine
      const nextAutos = new Array<boolean>(SHINE_HARMONIC_COUNT).fill(on)
      setShine({
        ...current,
        autos: nextAutos,
        bumps: on ? current.bumps : new Array<boolean>(SHINE_HARMONIC_COUNT).fill(false),
      })
    },
    [setShine],
  )

  const setAllBumps = useCallback(
    (on: boolean) => {
      const current = useDroneStore.getState().shine
      const nextBumps = current.autos.map((autoOn) => (on ? autoOn : false))
      setShine({ ...current, bumps: nextBumps })
    },
    [setShine],
  )

  const setVolume = useCallback(
    (value: number) => {
      const current = useDroneStore.getState().shine
      setShine({ ...current, volume: value })
    },
    [setShine],
  )

  const setOctaveIndex = useCallback(
    (index: number) => {
      const current = useDroneStore.getState().shine
      setShine({ ...current, octaveIndex: index })
    },
    [setShine],
  )

  return {
    enabled,
    running: isActive,
    levels,
    autos,
    bumps,
    displayLevels,
    volume,
    octaveIndex,
    toggleRunning,
    setLevel,
    setAuto,
    setBumps,
    allOn,
    allOff,
    setAllAuto,
    setAllBumps,
    setVolume,
    setOctaveIndex,
  }
}
