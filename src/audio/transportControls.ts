import { droneEngine } from './DroneEngine'
import { metronomeEngine } from './MetronomeEngine'
import type { DroneRuntimeConfig } from './types'
import { stepPresetNavigation, playNextPresetFromTransportMarker } from './presetNavigationTransport'
import { isTransportMarkerKey } from '../presets/presetNavigation'
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

function prepareMetronomeForTransportPlay(): void {
  if (useDroneStore.getState().metronomeSyncEnabled) {
    metronomeEngine.prepareContext()
  }
}

function isOnTransportMarker(): boolean {
  const state = useDroneStore.getState()
  return isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation)
}

export function transportPlay(config: DroneRuntimeConfig): void {
  if (isOnTransportMarker()) {
    playNextPresetFromTransportMarker()
    return
  }
  droneEngine.setPlaybackIntent(true)
  droneEngine.markGesturePlaybackStarted()
  if (droneEngine.canFastResume()) {
    droneEngine.fastResume(config)
  } else {
    droneEngine.ensureRunning(config)
  }
  prepareMetronomeForTransportPlay()
  useDroneStore.getState().setPlaying(true)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(true)
  }
}

/** Low-latency play for BT media remotes (Clip 5, lock screen). */
export function transportPlayFromRemote(config: DroneRuntimeConfig): void {
  if (useDroneStore.getState().playing) {
    return
  }
  if (isOnTransportMarker()) {
    playNextPresetFromTransportMarker()
    return
  }
  droneEngine.setPlaybackIntent(true)
  droneEngine.markGesturePlaybackStarted()
  droneEngine.prepareContextForGesture()
  if (droneEngine.canFastResume()) {
    droneEngine.fastResume(config, { skipEntryGlide: true })
  } else {
    droneEngine.ensureRunning(config)
  }
  prepareMetronomeForTransportPlay()
  useDroneStore.getState().setPlaying(true)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(true)
  }
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
  prepareMetronomeForTransportPlay()
  useDroneStore.getState().setPlaying(true)
  if (needsIosMediaRemoteIntegration()) {
    syncMediaSessionPlaybackState(true)
  }
}

export function transportNextPreset(config: DroneRuntimeConfig): void {
  recordBleDebug('note', `nextPreset ctx=${droneEngine.contextDebugLabel()}`)
  stepPresetNavigation('next', config)
}

export function transportPreviousPreset(config: DroneRuntimeConfig): void {
  recordBleDebug('note', `prevPreset ctx=${droneEngine.contextDebugLabel()}`)
  stepPresetNavigation('previous', config)
}

export function transportNextSong(): void {
  recordBleDebug('note', `nextSong ctx=${droneEngine.contextDebugLabel()}`)
  useDroneStore.getState().selectNextSong()
}

export function transportPreviousSong(): void {
  recordBleDebug('note', `prevSong ctx=${droneEngine.contextDebugLabel()}`)
  useDroneStore.getState().selectPreviousSong()
}

const MASTER_GAIN_STEP_DB = 2

export function transportVolumeUp(): void {
  const state = useDroneStore.getState()
  state.setMasterGainDb(state.masterGainDb + MASTER_GAIN_STEP_DB)
  recordBleDebug('note', `vol up ${useDroneStore.getState().masterGainDb.toFixed(1)} dB`)
}

export function transportVolumeDown(): void {
  const state = useDroneStore.getState()
  state.setMasterGainDb(state.masterGainDb - MASTER_GAIN_STEP_DB)
  recordBleDebug('note', `vol down ${useDroneStore.getState().masterGainDb.toFixed(1)} dB`)
}

export function transportPresetPedalPress(
  pendingTimeoutRef: { current: number | null },
  config: DroneRuntimeConfig,
  windowMs = 300,
): void {
  if (pendingTimeoutRef.current !== null) {
    window.clearTimeout(pendingTimeoutRef.current)
    pendingTimeoutRef.current = null
    transportPreviousPreset(config)
    return
  }
  pendingTimeoutRef.current = window.setTimeout(() => {
    transportNextPreset(config)
    pendingTimeoutRef.current = null
  }, windowMs)
}
