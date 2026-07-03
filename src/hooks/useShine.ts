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

function baseFrequency(noteIndex: number, octaveIndex: number, a4Hz: number): number {
  const midi = 12 * (octaveIndex + 1) + noteIndex
  return a4Hz * 2 ** ((midi - 69) / 12)
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
  const { enabled, levels, autos, bumps, volume, octaveIndex } = shine

  const [running, setRunning] = useState(false)
  const [displayLevels, setDisplayLevels] = useState<number[]>(zeros)

  const rafRef = useRef<number | null>(null)
  const lastMeterUpdateRef = useRef(0)

  useEffect(() => {
    shineEngine.setBaseFrequency(baseFrequency(noteIndex, octaveIndex, a4Hz))
  }, [noteIndex, octaveIndex, a4Hz])

  useEffect(() => {
    shineEngine.setMasterGainDb(masterGainDb)
  }, [masterGainDb])

  // Push preset/live config into the engine whenever it changes.
  useEffect(() => {
    levels.forEach((level, index) => shineEngine.setHarmonicLevel(index, level))
  }, [levels])

  useEffect(() => {
    autos.forEach((on, index) => shineEngine.setHarmonicAuto(index, on))
  }, [autos])

  useEffect(() => {
    bumps.forEach((on, index) => shineEngine.setHarmonicBumps(index, on))
  }, [bumps])

  useEffect(() => {
    shineEngine.setVolume(volume)
  }, [volume])

  useEffect(() => {
    setDisplayLevels(levels.map((level, index) => (autos[index] ? 0 : level)))
  }, [levels, autos])

  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setDisplayLevels(levels.map((level, index) => (autos[index] ? 0 : level)))
      return
    }

    const tick = () => {
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
  }, [running, autos, levels])

  useEffect(() => {
    return () => {
      shineEngine.stop()
    }
  }, [])

  useEffect(() => {
    if (enabled && playing) {
      void shineEngine.resume()
      shineEngine.start()
      setRunning(true)
      return
    }
    shineEngine.stop()
    setRunning(false)
  }, [enabled, playing])

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
    running,
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
