import { droneEngine } from './DroneEngine'
import type { DroneRuntimeConfig } from './types'
import { useDroneStore } from '../store/useDroneStore'

/** Shared play/pause/preset actions for UI, BlueTurn keyboard, and Media Session. */

export function transportPlay(config: DroneRuntimeConfig): void {
  droneEngine.setPlaybackIntent(true)
  droneEngine.ensureRunning(config)
  useDroneStore.getState().setPlaying(true)
}

export function transportPause(): void {
  droneEngine.stop()
  useDroneStore.getState().setPlaying(false)
}

export function transportTogglePlay(config: DroneRuntimeConfig): void {
  if (useDroneStore.getState().playing) {
    transportPause()
    return
  }
  transportPlay(config)
}

export function transportResume(config: DroneRuntimeConfig): void {
  droneEngine.setPlaybackIntent(true)
  droneEngine.fastResume(config)
  useDroneStore.getState().setPlaying(true)
}

export function transportNextPreset(): void {
  useDroneStore.getState().selectNextPreset()
}

export function transportPreviousPreset(): void {
  useDroneStore.getState().selectPreviousPreset()
}

/** Single tap = next preset; double tap within windowMs = previous preset. */
export function transportPresetPedalPress(
  pendingTimeoutRef: { current: number | null },
  windowMs = 260,
): void {
  if (pendingTimeoutRef.current !== null) {
    window.clearTimeout(pendingTimeoutRef.current)
    pendingTimeoutRef.current = null
    transportPreviousPreset()
    return
  }
  pendingTimeoutRef.current = window.setTimeout(() => {
    transportNextPreset()
    pendingTimeoutRef.current = null
  }, windowMs)
}
