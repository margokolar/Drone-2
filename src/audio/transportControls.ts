import { droneEngine } from './DroneEngine'
import type { DroneRuntimeConfig } from './types'
import { useDroneStore } from '../store/useDroneStore'
import { recordBleDebug } from '../utils/bleDebug'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'

/** Shared play/pause/preset actions for UI, BlueTurn keyboard, and Media Session. */

function syncMediaSessionPlaybackState(playing: boolean): void {
  if (!('mediaSession' in navigator)) {
    return
  }
  try {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  } catch {
    // Ignore browsers that reject the write.
  }
}

/** Re-apply playbackState from store (e.g. after iOS resumes the silent anchor). */
export function transportSyncPlaybackState(): void {
  syncMediaSessionPlaybackState(useDroneStore.getState().playing)
}

export function transportPlay(config: DroneRuntimeConfig): void {
  droneEngine.setPlaybackIntent(true)
  if (droneEngine.canFastResume()) {
    droneEngine.fastResume(config)
  } else {
    droneEngine.ensureRunning(config)
  }
  useDroneStore.getState().setPlaying(true)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(true)
  }
}

/** Low-latency play for BT media remotes (Clip 5, lock screen). Same path as UI/pedal. */
export function transportPlayFromRemote(config: DroneRuntimeConfig): void {
  if (useDroneStore.getState().playing) {
    return
  }
  transportPlay(config)
  recordBleDebug('note', `remote play ctx=${droneEngine.contextDebugLabel()}`)
}

export function transportPause(): void {
  droneEngine.pause()
  useDroneStore.getState().setPlaying(false)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(false)
  }
  recordBleDebug('note', `paused ctx=${droneEngine.contextDebugLabel()}`)
  window.setTimeout(() => {
    recordBleDebug(
      'note',
      `mute@+300 gain=${droneEngine.masterGainValue().toFixed(4)} ctx=${droneEngine.contextDebugLabel()}`,
    )
  }, 300)
}

/** Low-latency pause for BT media remotes. */
export function transportPauseFromRemote(): void {
  if (!useDroneStore.getState().playing) {
    return
  }
  droneEngine.pause()
  useDroneStore.getState().setPlaying(false)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(false)
  }
  recordBleDebug('note', `remote pause ctx=${droneEngine.contextDebugLabel()}`)
}

export function transportTogglePlay(config: DroneRuntimeConfig): void {
  const before = useDroneStore.getState().playing
  recordBleDebug('note', `toggle before=${before} ctx=${droneEngine.contextDebugLabel()}`)
  if (before) {
    transportPause()
    return
  }
  transportPlay(config)
}

export function transportResume(config: DroneRuntimeConfig): void {
  droneEngine.setPlaybackIntent(true)
  droneEngine.fastResume(config)
  useDroneStore.getState().setPlaying(true)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(true)
  }
}

export function transportNextPreset(): void {
  recordBleDebug('note', `nextPreset ctx=${droneEngine.contextDebugLabel()}`)
  useDroneStore.getState().selectNextPreset()
}

export function transportPreviousPreset(): void {
  recordBleDebug('note', `prevPreset ctx=${droneEngine.contextDebugLabel()}`)
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
