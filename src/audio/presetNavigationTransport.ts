import {
  getEnabledNavigationEntries,
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

function startPresetPlayback(config: DroneRuntimeConfig): void {
  droneEngine.setPlaybackIntent(true)
  droneEngine.markGesturePlaybackStarted()
  droneEngine.prepareContextForGesture()
  if (droneEngine.canFastResume()) {
    droneEngine.fastResume(config, { skipEntryGlide: false })
  } else {
    droneEngine.ensureRunning(config)
  }
  if (useDroneStore.getState().metronomeSyncEnabled) {
    metronomeEngine.prepareContext()
  }
  useDroneStore.getState().setPlaying(true)
}

function applyPresetFromNavigation(
  presetId: string,
  startPlayback = false,
): void {
  const preset = useDroneStore.getState().presets.find((item) => item.id === presetId)
  if (!preset) {
    return
  }
  droneEngine.markPresetTransition()
  shineEngine.markPresetTransition()
  useDroneStore.getState().loadPreset(presetId)
  if (!startPlayback) {
    return
  }
  const freshConfig = buildRuntimeConfigFromStore(useDroneStore.getState())
  startPresetPlayback(freshConfig)
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
    applyPresetFromNavigation(afterMarker.presetId, true)
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
}

/** Play/pause marker is active: load the next preset in navigation and start it. */
export function playNextPresetFromTransportMarker(): void {
  const state = useDroneStore.getState()
  const activeKey = state.activeNavigationKey || state.activePresetId
  if (!isTransportMarkerKey(activeKey, state.presetNavigation)) {
    return
  }
  const enabledEntries = getEnabledNavigationEntries(state.presetNavigation, state.presets)
  advancePastTransportMarker('next', activeKey, enabledEntries)
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
    return
  }

  const leavingTransportMarker = isTransportMarkerKey(activeKey, state.presetNavigation)
  applyPresetFromNavigation(nextEntry.presetId, leavingTransportMarker)
}
