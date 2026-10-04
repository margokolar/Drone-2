import {
  getEnabledNavigationEntries,
  hasPresetLoopSync,
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
import { loopEngine } from './LoopEngine'
import { ensureLoopSlotLoaded, loadedPlaybackSlot } from './loopSlotPlayback'
import { loopSlotFileName, presetLoopSyncSlot, type LoopSlot } from './loopSlots'
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
  if (markerId) {
    return isTransportMarkerClickSyncEnabled(state.presetNavigation, markerId)
  }
  if (hasTransportClickSync(state.presetNavigation)) {
    return false
  }
  return state.metronomeSyncEnabled
}

function shouldStartClickWithCurrentItem(): boolean {
  const state = useDroneStore.getState()
  if (isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation)) {
    return isTransportMarkerClickSyncEnabled(state.presetNavigation, state.activeNavigationKey)
  }
  if (hasTransportClickSync(state.presetNavigation)) {
    return isPresetClickSyncEnabled(state.presets, state.activePresetId, state.presetNavigation)
  }
  return state.metronomeSyncEnabled
}

function startSyncedClick(): void {
  const state = useDroneStore.getState()
  clickFollowsTransport = true
  if (state.metronomeMuted) {
    state.setMetronomeMuted(false)
  }
  metronomeEngine.prepareContext()
  state.setMetronomeEnabled(true)
}

function stopSyncedClick(): void {
  clickFollowsTransport = false
  metronomeEngine.stopFromGesture()
  useDroneStore.getState().setMetronomeEnabled(false)
}

function applyClickSyncForTransport(playing: boolean, markerId?: string): void {
  if (playing) {
    if (!shouldSyncClickWithMarker(markerId)) {
      return
    }
    startSyncedClick()
    return
  }
  if (!shouldSyncClickWithMarker(markerId) && !clickFollowsTransport) {
    return
  }
  stopSyncedClick()
}

/** True after the loop was started because a play/pause marker coupled it to playback. */
let loopFollowsTransport = false
let pendingLoopQuantize: { presetId: string; startPlayback: boolean } | null = null
let loopStartGeneration = 0

export function cancelPendingLoopQuantize(): void {
  pendingLoopQuantize = null
  loopStartGeneration += 1
  loopEngine.cancelScheduledCycleStart()
}

function currentSongId(): string | undefined {
  const state = useDroneStore.getState()
  return state.songLibrary.find((song) => song.name === state.songName)?.id
}

function resolvePlaybackLoopSlot(presetId?: string): LoopSlot | null {
  const state = useDroneStore.getState()
  if (!state.loopFeaturesEnabled) {
    return null
  }
  if (hasPresetLoopSync(state.presets)) {
    const id = presetId ?? state.activePresetId
    const slot = presetLoopSyncSlot(state.presets.find((preset) => preset.id === id))
    if (slot == null) {
      return null
    }
    return loopSlotFileName(state.loopSlots, slot) ? slot : null
  }
  if (!state.loopSyncEnabled) {
    return null
  }
  return loopSlotFileName(state.loopSlots, state.activeLoopSlot) ? state.activeLoopSlot : null
}

function shouldLoopSyncForPreset(presetId: string): boolean {
  return resolvePlaybackLoopSlot(presetId) != null
}

export function shouldStartLoopWithCurrentItem(): boolean {
  const state = useDroneStore.getState()
  if (isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation)) {
    return false
  }
  return shouldLoopSyncForPreset(state.activePresetId)
}

function sameLoopIsCycling(slot: LoopSlot): boolean {
  return loadedPlaybackSlot() === slot && loopEngine.isCycling()
}

function startSyncedLoop(restart: boolean, onStarted?: () => void, presetId?: string): void {
  const state = useDroneStore.getState()
  const slot = resolvePlaybackLoopSlot(presetId)
  if (slot == null) {
    onStarted?.()
    return
  }
  loopFollowsTransport = true
  if (state.loopMuted) {
    state.setLoopMuted(false)
  }
  loopEngine.prepareContext()
  if (state.activeLoopSlot !== slot) {
    state.setActiveLoopSlot(slot)
  }
  const shouldRestart = restart || !sameLoopIsCycling(slot)
  const startGen = ++loopStartGeneration
  void ensureLoopSlotLoaded(currentSongId(), slot).then((ok) => {
    if (startGen !== loopStartGeneration) {
      return
    }
    if (resolvePlaybackLoopSlot(presetId) !== slot) {
      return
    }
    if (!ok) {
      if (sameLoopIsCycling(slot) || (loadedPlaybackSlot() === slot && loopEngine.hasAudio())) {
        onStarted?.()
        useDroneStore.getState().setLoopEnabled(true)
        return
      }
      onStarted?.()
      return
    }
    if (shouldRestart && !sameLoopIsCycling(slot)) {
      loopEngine.playFromStart(onStarted)
    } else {
      onStarted?.()
    }
    useDroneStore.getState().setLoopEnabled(true)
  })
}

function stopSyncedLoop(): void {
  loopFollowsTransport = false
  cancelPendingLoopQuantize()
  loopEngine.stopFromGesture()
  useDroneStore.getState().setLoopEnabled(false)
}

function applyLoopSyncForTransport(playing: boolean): void {
  if (playing) {
    if (!shouldStartLoopWithCurrentItem()) {
      return
    }
    startSyncedLoop(true)
    return
  }
  stopSyncedLoop()
}

function syncMediaSessionPlaying(): void {
  if (!needsIosMediaRemoteIntegration() || !('mediaSession' in navigator)) {
    return
  }
  try {
    navigator.mediaSession.playbackState = 'playing'
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
  useDroneStore.getState().setPlaying(true)
  syncMediaSessionPlaying()
}

function startLoopThenDrone(config: DroneRuntimeConfig, presetId: string): void {
  droneEngine.prepareContextForGesture()
  loopEngine.prepareContext()
  const slot = resolvePlaybackLoopSlot(presetId)
  const restart = slot == null || !sameLoopIsCycling(slot)
  startSyncedLoop(restart, () => {
    startPresetPlayback(config)
    syncClickWithTransportPlayState(true)
    applyClickSyncForPreset(presetId)
  }, presetId)
}

/** Play the current tone at the next loop start when sync is on and a cycle is already running. */
export function playLoopSyncedTransport(config: DroneRuntimeConfig): void {
  cancelPendingLoopQuantize()
  droneEngine.prepareContextForGesture()
  loopEngine.prepareContext()
  const loopAlreadyCycling = loopEngine.isCycling()
  const startNow = () => {
    startSyncedLoop(!loopAlreadyCycling, () => {
      startPresetPlayback(config)
      syncClickWithTransportPlayState(true)
    })
  }
  if (loopAlreadyCycling) {
    loopEngine.scheduleAtNextCycleStart(startNow)
    return
  }
  startNow()
}

/** Transport play/pause button and remotes: keep click in step when SYNC is on. */
export function syncClickWithTransportPlayState(playing: boolean): void {
  if (playing) {
    if (!shouldStartClickWithCurrentItem()) {
      return
    }
    startSyncedClick()
    return
  }
  if (!shouldStartClickWithCurrentItem() && !clickFollowsTransport) {
    return
  }
  stopSyncedClick()
}

/** Transport play/pause: keep the WAV loop in step when a preset (or global SYNC) wants it. */
export function syncLoopWithTransportPlayState(playing: boolean): void {
  if (playing) {
    if (!shouldStartLoopWithCurrentItem()) {
      stopSyncedLoop()
      return
    }
    startSyncedLoop(true)
    return
  }
  stopSyncedLoop()
}

export function applyClickSyncForPreset(presetId: string): void {
  const state = useDroneStore.getState()
  if (!hasTransportClickSync(state.presetNavigation)) {
    applyLoopSyncForPreset(presetId)
    return
  }
  if (isPresetClickSyncEnabled(state.presets, presetId, state.presetNavigation) && state.playing) {
    startSyncedClick()
    applyLoopSyncForPreset(presetId)
    return
  }
  if (state.playing || clickFollowsTransport) {
    stopSyncedClick()
  }
  applyLoopSyncForPreset(presetId)
}

export function applyLoopSyncForPreset(presetId: string): void {
  const state = useDroneStore.getState()
  const wantsLoop = shouldLoopSyncForPreset(presetId)
  if (wantsLoop && state.playing) {
    const slot = resolvePlaybackLoopSlot(presetId)
    startSyncedLoop(slot == null || !sameLoopIsCycling(slot), undefined, presetId)
    return
  }
  if (state.playing || loopFollowsTransport) {
    stopSyncedLoop()
  }
}

function applyPresetFromNavigationNow(presetId: string, startPlayback: boolean): void {
  const preset = useDroneStore.getState().presets.find((item) => item.id === presetId)
  if (!preset) {
    return
  }
  droneEngine.markPresetTransition()
  shineEngine.markPresetTransition()
  useDroneStore.getState().loadPreset(presetId)
  const alreadyPlaying = useDroneStore.getState().playing
  if (!startPlayback || alreadyPlaying) {
    applyClickSyncForPreset(presetId)
    return
  }
  const freshConfig = buildRuntimeConfigFromStore(useDroneStore.getState())
  if (shouldLoopSyncForPreset(presetId)) {
    startLoopThenDrone(freshConfig, presetId)
    return
  }
  startPresetPlayback(freshConfig)
  applyClickSyncForPreset(presetId)
}

function applyPresetFromNavigation(presetId: string, startPlayback = false): void {
  cancelPendingLoopQuantize()
  const willPlay = startPlayback || useDroneStore.getState().playing
  if (shouldLoopSyncForPreset(presetId) && willPlay && loopEngine.isCycling()) {
    pendingLoopQuantize = { presetId, startPlayback }
    useDroneStore.setState({ activeNavigationKey: presetId })
    droneEngine.prepareContextForGesture()
    loopEngine.prepareContext()
    loopEngine.scheduleAtNextCycleStart(() => {
      const pending = pendingLoopQuantize
      pendingLoopQuantize = null
      if (!pending) {
        return
      }
      applyPresetFromNavigationNow(pending.presetId, pending.startPlayback)
    })
    return
  }
  applyPresetFromNavigationNow(presetId, startPlayback)
}

/** Load a preset from the list or home screen, waiting for the loop start when sync is on. */
export function activatePresetFromNavigation(presetId: string, startPlayback = false): void {
  applyPresetFromNavigation(presetId, startPlayback)
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
  applyClickSyncForTransport(false, markerId)
  applyLoopSyncForTransport(false)
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
    applyLoopSyncForTransport(false)
    return
  }

  const leavingTransportMarker = isTransportMarkerKey(activeKey, state.presetNavigation)
  applyPresetFromNavigation(nextEntry.presetId, leavingTransportMarker)
}
