import {
  getEnabledNavigationEntries,
  hasTransportClickSync,
  isPresetClickSyncEnabled,
  isTransportMarkerClickSyncEnabled,
  isTransportMarkerKey,
  navigationEntryKey,
  selectNextInRing,
  selectPreviousInRing,
  type PresetNavigationEntry,
} from '../presets/presetNavigation'
import { useDroneStore } from '../store/useDroneStore'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'
import { droneEngine } from './DroneEngine'
import { metronomeEngine } from './MetronomeEngine'
import { shineEngine } from './ShineEngine'
import { buildRuntimeConfigFromStore } from './runtimeConfigFromStore'
import type { DroneRuntimeConfig } from './types'

/** Pause audio and sync store + iOS media session (same as transport pause button). */
export function syncTransportPaused(): void {
  droneEngine.setPlaybackIntent(false)
  droneEngine.pause()
  useDroneStore.getState().setPlaying(false)
  if (!needsIosMediaRemoteIntegration() || !('mediaSession' in navigator)) {
    return
  }
  try {
    navigator.mediaSession.playbackState = 'paused'
  } catch {
    // Ignore browsers that reject the write.
  }
}

/** True after click was started because a play/pause marker (or global SYNC) coupled it to playback. */
let clickFollowsTransport = false

function shouldSyncClickWithMarker(markerId?: string): boolean {
  const state = useDroneStore.getState()
  if (state.metronomeSyncEnabled) {
    return true
  }
  if (!markerId) {
    return false
  }
  return isTransportMarkerClickSyncEnabled(state.presetNavigation, markerId)
}

function applyClickSyncForTransport(playing: boolean, markerId?: string): void {
  if (!shouldSyncClickWithMarker(markerId)) {
    return
  }
  const state = useDroneStore.getState()
  if (playing) {
    clickFollowsTransport = true
    if (state.metronomeMuted) {
      state.setMetronomeMuted(false)
    }
    metronomeEngine.prepareContext()
    state.setMetronomeEnabled(true)
    return
  }
  metronomeEngine.stopFromGesture()
  state.setMetronomeEnabled(false)
}

function shouldFollowClickWithTransport(): boolean {
  const state = useDroneStore.getState()
  if (state.metronomeSyncEnabled || clickFollowsTransport) {
    return true
  }
  if (
    isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation) ||
    !hasTransportClickSync(state.presetNavigation)
  ) {
    return false
  }
  return isPresetClickSyncEnabled(state.presets, state.activePresetId, state.presetNavigation)
}

/** Transport play/pause button and remotes: keep click in step when SYNC is on. */
export function syncClickWithTransportPlayState(playing: boolean): void {
  if (!shouldFollowClickWithTransport()) {
    return
  }
  const state = useDroneStore.getState()
  if (playing) {
    clickFollowsTransport = true
    if (state.metronomeMuted) {
      state.setMetronomeMuted(false)
    }
    metronomeEngine.prepareContext()
    state.setMetronomeEnabled(true)
    return
  }
  metronomeEngine.stopFromGesture()
  state.setMetronomeEnabled(false)
}

export function applyClickSyncForPreset(presetId: string): void {
  const state = useDroneStore.getState()
  if (state.metronomeSyncEnabled || !hasTransportClickSync(state.presetNavigation)) {
    return
  }
  if (isPresetClickSyncEnabled(state.presets, presetId, state.presetNavigation) && state.playing) {
    clickFollowsTransport = true
    if (state.metronomeMuted) {
      state.setMetronomeMuted(false)
    }
    metronomeEngine.prepareContext()
    state.setMetronomeEnabled(true)
    return
  }
  clickFollowsTransport = false
  metronomeEngine.stopFromGesture()
  state.setMetronomeEnabled(false)
}

function startPresetPlayback(config: DroneRuntimeConfig, clickSyncMarkerId?: string): void {
  droneEngine.setPlaybackIntent(true)
  droneEngine.markGesturePlaybackStarted()
  droneEngine.prepareContextForGesture()
  if (droneEngine.canFastResume()) {
    droneEngine.fastResume(config, { skipEntryGlide: false })
  } else {
    droneEngine.ensureRunning(config)
  }
  useDroneStore.getState().setPlaying(true)
  applyClickSyncForTransport(true, clickSyncMarkerId)
}

function applyPresetFromNavigation(
  presetId: string,
  startPlayback = false,
  clickSyncMarkerId?: string,
): void {
  const preset = useDroneStore.getState().presets.find((item) => item.id === presetId)
  if (!preset) {
    return
  }
  droneEngine.markPresetTransition()
  shineEngine.markPresetTransition()
  useDroneStore.getState().loadPreset(presetId)
  if (!startPlayback) {
    applyClickSyncForPreset(presetId)
    return
  }
  const freshConfig = buildRuntimeConfigFromStore(useDroneStore.getState())
  startPresetPlayback(freshConfig, clickSyncMarkerId)
  applyClickSyncForPreset(presetId)
}

function advancePastTransportMarker(
  direction: 'next' | 'previous',
  activeKey: string,
  enabledEntries: ReturnType<typeof getEnabledNavigationEntries>,
): void {
  const afterMarker =
    direction === 'next'
      ? selectNextInRing(enabledEntries, activeKey, navigationEntryKey)
      : selectPreviousInRing(enabledEntries, activeKey, navigationEntryKey)
  if (afterMarker?.kind === 'preset') {
    applyPresetFromNavigation(afterMarker.presetId, true, activeKey)
  }
}

/** Select a play/pause marker without advancing to the next preset. */
export function activateTransportMarker(markerId: string): void {
  const state = useDroneStore.getState()
  if (!isTransportMarkerKey(markerId, state.presetNavigation)) {
    return
  }
  syncTransportPaused()
  useDroneStore.setState({ activeNavigationKey: markerId })
  applyClickSyncForTransport(false, markerId)
}

/** Load the preset after this play/pause marker and start it. */
export function playNextPresetAfterTransportMarker(markerId: string): void {
  const state = useDroneStore.getState()
  if (!isTransportMarkerKey(markerId, state.presetNavigation)) {
    return
  }
  const enabledEntries = getEnabledNavigationEntries(state.presetNavigation, state.presets)
  advancePastTransportMarker('next', markerId, enabledEntries)
}

/** Play/pause marker is active: load the next preset in navigation and start it. */
export function playNextPresetFromTransportMarker(): void {
  const state = useDroneStore.getState()
  const activeKey = state.activeNavigationKey || state.activePresetId
  playNextPresetAfterTransportMarker(activeKey)
}

function resolveNavigationActiveKey(
  navigation: PresetNavigationEntry[],
  enabledEntries: PresetNavigationEntry[],
  activeNavigationKey: string,
  activePresetId: string,
): string {
  if (enabledEntries.some((entry) => navigationEntryKey(entry) === activeNavigationKey)) {
    return activeNavigationKey
  }

  const activePresetEntry = enabledEntries.find(
    (entry) => entry.kind === 'preset' && entry.presetId === activePresetId,
  )
  if (activePresetEntry) {
    return navigationEntryKey(activePresetEntry)
  }

  const fullKeys = navigation.map(navigationEntryKey)
  let startIndex = fullKeys.indexOf(activeNavigationKey)
  if (startIndex < 0) {
    startIndex = navigation.findIndex(
      (entry) => entry.kind === 'preset' && entry.presetId === activePresetId,
    )
  }
  if (startIndex >= 0) {
    for (let offset = 0; offset < navigation.length; offset += 1) {
      const entry = navigation[(startIndex - offset + navigation.length) % navigation.length]
      const key = navigationEntryKey(entry)
      if (enabledEntries.some((enabled) => navigationEntryKey(enabled) === key)) {
        return key
      }
    }
  }

  return enabledEntries.length > 0 ? navigationEntryKey(enabledEntries[0]) : activeNavigationKey
}

export function stepPresetNavigation(
  direction: 'next' | 'previous',
  _config: DroneRuntimeConfig,
): void {
  const state = useDroneStore.getState()
  const enabledEntries = getEnabledNavigationEntries(state.presetNavigation, state.presets)
  if (enabledEntries.length <= 1) {
    return
  }

  const activeKey = resolveNavigationActiveKey(
    state.presetNavigation,
    enabledEntries,
    state.activeNavigationKey || state.activePresetId,
    state.activePresetId,
  )
  const nextEntry =
    direction === 'next'
      ? selectNextInRing(enabledEntries, activeKey, navigationEntryKey)
      : selectPreviousInRing(enabledEntries, activeKey, navigationEntryKey)

  if (!nextEntry) {
    return
  }

  if (nextEntry.kind === 'transport') {
    if (activeKey === nextEntry.id) {
      advancePastTransportMarker(direction, activeKey, enabledEntries)
      return
    }
    syncTransportPaused()
    useDroneStore.setState({ activeNavigationKey: nextEntry.id })
    applyClickSyncForTransport(false, nextEntry.id)
    return
  }

  const leavingTransportMarker = isTransportMarkerKey(activeKey, state.presetNavigation)
  applyPresetFromNavigation(
    nextEntry.presetId,
    leavingTransportMarker,
    leavingTransportMarker ? activeKey : undefined,
  )
}
