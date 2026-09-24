import { Capacitor } from '@capacitor/core'
import { droneEngine } from '../audio/DroneEngine'
import { buildRuntimeConfigFromStore } from '../audio/runtimeConfigFromStore'
import { transportPauseFromRemote, transportPlayFromRemote, transportMediaNextPress, transportMediaPreviousPress, transportVolumeDown, transportVolumeUp } from '../audio/transportControls'
import { markMediaSessionAction, wasMediaSessionHandledRecently } from '../utils/mediaRemoteDedupe'
import { nowPlayingLabels } from '../utils/nowPlayingLabels'
import { flashTransport } from '../utils/transportFlash'
import { useDroneStore } from '../store/useDroneStore'
import { microphoneHoldsSessionNow } from '../audio/iosAudioSession'
import { AudioSession } from './audioSession'

function isOnScreen(): boolean {
  return document.visibilityState === 'visible'
}

let yieldedToOtherAudio = false

/**
 * Capacitor-only: exclusive AVAudioSession only while this app is sounding.
 * Background idle must not hold CarPlay / car radio. If radio takes the
 * session, stay yielded until the user presses Play.
 * No-op on web/PWA.
 */
export async function startNativeAudioSessionGuard(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    return () => {}
  }

  let reclaimQueued = false
  const reclaimWebAudio = () => {
    if (!useDroneStore.getState().playing) {
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
        return
      }
      yieldedToOtherAudio = true
      transportPauseFromRemote()
      void AudioSession.deactivate().catch(() => {})
      return
    }
    if (!event.shouldResume || yieldedToOtherAudio) {
      return
    }
    if (!useDroneStore.getState().playing) {
      return
    }
    scheduleReclaim()
  })

  const routeHandle = await AudioSession.addListener('routeChange', () => {
    if (yieldedToOtherAudio || !useDroneStore.getState().playing) {
      return
    }
    scheduleReclaim()
  })

  const remoteHandle = await AudioSession.addListener('remoteCommand', (event) => {
    const action = event.action
    const config = buildRuntimeConfigFromStore(useDroneStore.getState())
    if (action === 'pause') {
      flashTransport('play')
      transportPauseFromRemote()
      return
    }
    if (action === 'play') {
      yieldedToOtherAudio = false
      flashTransport('play')
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
      flashTransport('play')
      transportPauseFromRemote()
    } else {
      yieldedToOtherAudio = false
      flashTransport('play')
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
  let releaseTimer = 0
  const syncAudioFocus = () => {
    const state = useDroneStore.getState()
    const own = state.playing || state.metronomeEnabled
    if (state.playing) {
      yieldedToOtherAudio = false
    }
    if (own && !yieldedToOtherAudio) {
      if (releaseTimer) {
        window.clearTimeout(releaseTimer)
        releaseTimer = 0
      }
      void AudioSession.configurePlayback().catch(() => {})
      const labels = nowPlayingLabels(state)
      const key = `on\0${labels.title}\0${labels.artist}\0${labels.sequence.join('\0')}\0${labels.activeIndex}`
      if (key === lastNowPlaying) {
        return
      }
      lastNowPlaying = key
      void AudioSession.setNowPlaying({ ...labels, playing: true }).catch(() => {})
      return
    }
    lastNowPlaying = 'off'
    if (microphoneHoldsSessionNow()) {
      return
    }
    const delayMs = state.playbackFadeEnabled
      ? Math.max(80, state.playbackFadeOutSeconds * 1000)
      : 80
    if (releaseTimer) {
      window.clearTimeout(releaseTimer)
    }
    releaseTimer = window.setTimeout(() => {
      releaseTimer = 0
      void AudioSession.deactivate().catch(() => {})
    }, delayMs)
  }
  syncAudioFocus()
  const unsubNowPlaying = useDroneStore.subscribe(syncAudioFocus)

  return () => {
    if (releaseTimer) {
      window.clearTimeout(releaseTimer)
    }
    void interruptionHandle.remove()
    void routeHandle.remove()
    void remoteHandle.remove()
    unsubKeepAwake()
    unsubNowPlaying()
    document.removeEventListener('visibilitychange', syncKeepAwake)
    void AudioSession.setKeepAwake({ on: false }).catch(() => {})
  }
}
