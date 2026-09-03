import {
  getEnabledNavigationEntries,
  isTransportMarkerKey,
  navigationEntryKey,
  selectNextInRing,
  selectPreviousInRing,
} from '../presets/presetNavigation'
import { useDroneStore } from '../store/useDroneStore'
import { droneEngine } from './DroneEngine'
import { metronomeEngine } from './MetronomeEngine'
import { shineEngine } from './ShineEngine'
import { buildRuntimeConfigFromStore } from './runtimeConfigFromStore'
import type { DroneRuntimeConfig } from './types'

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
  if (state.playing) {
    droneEngine.pause()
    useDroneStore.getState().setPlaying(false)
  }
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

export function stepPresetNavigation(
  direction: 'next' | 'previous',
  _config: DroneRuntimeConfig,
): void {
  const state = useDroneStore.getState()
  const enabledEntries = getEnabledNavigationEntries(state.presetNavigation, state.presets)
  if (enabledEntries.length <= 1) {
    return
  }

  const activeKey = state.activeNavigationKey || state.activePresetId
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
    if (state.playing) {
      droneEngine.pause()
      useDroneStore.getState().setPlaying(false)
    }
    useDroneStore.setState({ activeNavigationKey: nextEntry.id })
    return
  }

  const leavingTransportMarker = isTransportMarkerKey(activeKey, state.presetNavigation)
  applyPresetFromNavigation(nextEntry.presetId, leavingTransportMarker)
}
