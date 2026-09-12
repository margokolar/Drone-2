import { Capacitor } from '@capacitor/core'
import { droneEngine } from '../audio/DroneEngine'
import { buildRuntimeConfigFromStore } from '../audio/runtimeConfigFromStore'
import { transportPauseFromRemote, transportPlayFromRemote, transportMediaNextPress, transportMediaPreviousPress, transportVolumeDown, transportVolumeUp } from '../audio/transportControls'
import { markMediaSessionAction, wasMediaSessionHandledRecently } from '../utils/mediaRemoteDedupe'
import { nowPlayingLabels } from '../utils/nowPlayingLabels'
import { useDroneStore } from '../store/useDroneStore'
import { AudioSession } from './audioSession'

function isOnScreen(): boolean {
  return document.visibilityState === 'visible'
}

/**
 * Capacitor-only: exclusive AVAudioSession while this app owns audio.
 * Lock screen keeps native playback running; JS stays in sync for remotes.
 * No-op on web/PWA.
 */
export async function startNativeAudioSessionGuard(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    return () => {}
  }

  try {
    await AudioSession.configurePlayback()
  } catch {
    // Plugin missing or session busy — keep going; Web Audio may still work.
  }

  let reclaimQueued = false
  const reclaimWebAudio = () => {
    const playing = useDroneStore.getState().playing
    if (!playing) {
      if (!isOnScreen()) {
        return
      }
      void droneEngine.recoverIfStalled()
      return
    }
    void droneEngine.pokeClock()
  }
  const scheduleReclaim = () => {
    if (reclaimQueued) {
      return
    }
    reclaimQueued = true
    queueMicrotask(() => {
      reclaimQueued = false
      reclaimWebAudio()
    })
  }

  const interruptionHandle = await AudioSession.addListener('interruption', (event) => {
    if (event.type === 'began') {
      if (event.source === 'background') {
        droneEngine.noteInaudible()
      }
      return
    }
    if (!event.shouldResume) {
      return
    }
    if (!isOnScreen() && !useDroneStore.getState().playing) {
      return
    }
    scheduleReclaim()
  })

  const routeHandle = await AudioSession.addListener('routeChange', () => {
    if (!isOnScreen() && !useDroneStore.getState().playing) {
      return
    }
    scheduleReclaim()
  })

  const remoteHandle = await AudioSession.addListener('remoteCommand', (event) => {
    const action = event.action
    const config = buildRuntimeConfigFromStore(useDroneStore.getState())
    if (action === 'pause') {
      transportPauseFromRemote()
      return
    }
    if (action === 'play') {
      transportPlayFromRemote(config)
      return
    }
    if (action === 'next') {
      transportMediaNextPress(config)
      return
    }
    if (action === 'previous') {
      transportMediaPreviousPress()
      return
    }
    if (action === 'volup') {
      if (wasMediaSessionHandledRecently('volup')) {
        return
      }
      markMediaSessionAction('volup')
      transportVolumeUp()
      return
    }
    if (action === 'voldown') {
      if (wasMediaSessionHandledRecently('voldown')) {
        return
      }
      markMediaSessionAction('voldown')
      transportVolumeDown()
      return
    }
    if (useDroneStore.getState().playing) {
      transportPauseFromRemote()
    } else {
      transportPlayFromRemote(config)
    }
  })

  reclaimWebAudio()

  const syncKeepAwake = () => {
    const state = useDroneStore.getState()
    const on =
      isOnScreen() && (state.playing || state.controlsLocked || state.metronomeEnabled)
    void AudioSession.setKeepAwake({ on }).catch(() => {})
  }
  syncKeepAwake()
  const unsubKeepAwake = useDroneStore.subscribe(syncKeepAwake)
  document.addEventListener('visibilitychange', syncKeepAwake)

  let lastNowPlaying = ''
  const syncNowPlaying = () => {
    const labels = nowPlayingLabels(useDroneStore.getState())
    const key = `${labels.title}\0${labels.artist}`
    if (key === lastNowPlaying) {
      return
    }
    lastNowPlaying = key
    void AudioSession.setNowPlaying(labels).catch(() => {})
  }
  syncNowPlaying()
  const unsubNowPlaying = useDroneStore.subscribe(syncNowPlaying)

  return () => {
    void interruptionHandle.remove()
    void routeHandle.remove()
    void remoteHandle.remove()
    unsubKeepAwake()
    unsubNowPlaying()
    document.removeEventListener('visibilitychange', syncKeepAwake)
    void AudioSession.setKeepAwake({ on: false }).catch(() => {})
  }
}
