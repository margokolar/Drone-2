import { useEffect, useRef, type RefObject } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import {
  transportNextPreset,
  transportPause,
  transportPauseFromRemote,
  transportPlay,
  transportPlayFromRemote,
  transportPreviousPreset,
  transportResume,
  transportVolumeDown,
  transportVolumeUp,
} from '../audio/transportControls'
import type { DroneRuntimeConfig } from '../audio/types'
import type { Preset } from '../presets/defaultPresets'
import { useDroneStore } from '../store/useDroneStore'
import { recordBleDebug } from '../utils/bleDebug'
import {
  FOOT_PEDAL_PLAY_KEYS,
  FOOT_PEDAL_PRESET_KEYS,
  isTextEditingTarget,
  matchesFootPedalKey,
  MEDIA_PAUSE_KEYS,
  MEDIA_PLAY_KEYS,
  MEDIA_PLAY_PAUSE_KEYS,
  MEDIA_TRACK_NEXT_KEYS,
  MEDIA_TRACK_PREVIOUS_KEYS,
  PT_PEDAL_NEXT_KEYS,
  PT_PEDAL_PREVIOUS_KEYS,
  UNIVERSAL_VOLUME_DOWN_KEYS,
  UNIVERSAL_VOLUME_UP_KEYS,
} from '../utils/footPedalKeys'
import { markMediaSessionAction, wasMediaSessionHandledRecently } from '../utils/mediaRemoteDedupe'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'
import { runMediaSessionAction } from '../utils/restoreBleKeyboardFocus'

type UseBtControlOptions = {
  latestRuntimeConfigRef: RefObject<DroneRuntimeConfig>
  handleTogglePlay: () => void
  handlePresetPedalPress: () => void
  activePresetId: string
  presets: Preset[]
  songName: string
}

function createSilentAnchor(): { anchor: HTMLAudioElement; revoke: () => void } {
  const sampleRate = 8000
  const numSamples = sampleRate
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  const silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  const anchor = document.createElement('audio')
  anchor.src = silentUrl
  anchor.loop = true
  anchor.preload = 'auto'
  anchor.setAttribute('playsinline', '')
  anchor.setAttribute('webkit-playsinline', '')
  anchor.muted = false
  anchor.volume = 1
  anchor.setAttribute('aria-hidden', 'true')
  anchor.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none'
  document.body.appendChild(anchor)
  return {
    anchor,
    revoke: () => URL.revokeObjectURL(silentUrl),
  }
}

function setMediaSessionPlaybackState(playing: boolean): void {
  if (!('mediaSession' in navigator)) {
    return
  }
  try {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  } catch {
    // Ignore browsers that reject the write.
  }
}

function maintainPedalAnchor(anchor: HTMLAudioElement): void {
  if (anchor.paused) {
    void anchor.play().catch(() => {})
  }
  setMediaSessionPlaybackState(true)
}

function maintainSpeakerAnchor(
  anchor: HTMLAudioElement,
  clipRemoteHoldRef: RefObject<boolean>,
): void {
  const dronePlaying = useDroneStore.getState().playing
  setMediaSessionPlaybackState(dronePlaying)

  const clipHold = clipRemoteHoldRef.current && !dronePlaying
  if (clipHold) {
    return
  }

  if (dronePlaying) {
    clipRemoteHoldRef.current = false
  }
  if (anchor.paused) {
    void anchor.play().catch(() => {})
  }
}

export function useBtControl({
  latestRuntimeConfigRef,
  handleTogglePlay,
  handlePresetPedalPress,
  activePresetId,
  presets,
  songName,
}: UseBtControlOptions): RefObject<HTMLAudioElement | null> {
  const mediaAnchorRef = useRef<HTMLAudioElement | null>(null)
  const clipRemoteHoldRef = useRef(false)
  const btControlMode = useDroneStore((state) => state.btControlMode)
  const playing = useDroneStore((state) => state.playing)

  useEffect(() => {
    if (!needsIosMediaRemoteIntegration()) {
      return
    }

    const { anchor, revoke } = createSilentAnchor()
    mediaAnchorRef.current = anchor

    const primeAnchor = () => {
      if (
        useDroneStore.getState().btControlMode === 'speaker' &&
        clipRemoteHoldRef.current &&
        !useDroneStore.getState().playing
      ) {
        return
      }
      if (anchor.paused) {
        void anchor.play().catch(() => {})
      }
    }

    window.addEventListener('pointerdown', primeAnchor, { passive: true })
    window.addEventListener('keydown', primeAnchor)
    window.addEventListener('touchend', primeAnchor, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', primeAnchor)
      window.removeEventListener('keydown', primeAnchor)
      window.removeEventListener('touchend', primeAnchor)
      anchor.pause()
      anchor.removeAttribute('src')
      anchor.load()
      anchor.remove()
      revoke()
      mediaAnchorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!needsIosMediaRemoteIntegration() || !('mediaSession' in navigator)) {
      return
    }
    const activePresetName =
      presets.find((preset) => preset.id === activePresetId)?.name ?? 'Drone'
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activePresetName,
        artist: songName || 'Drone',
        album: 'Drone App',
      })
    } catch {
      // Some browsers reject MediaMetadata before user gesture; ignore.
    }
  }, [activePresetId, presets, songName])

  useEffect(() => {
    if (!needsIosMediaRemoteIntegration()) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) {
        return
      }
      if (event.repeat) {
        return
      }

      if (matchesFootPedalKey(event, PT_PEDAL_NEXT_KEYS)) {
        event.preventDefault()
        event.stopPropagation()
        void droneEngine.pokeClock()
        transportNextPreset()
        return
      }

      if (matchesFootPedalKey(event, PT_PEDAL_PREVIOUS_KEYS)) {
        event.preventDefault()
        event.stopPropagation()
        void droneEngine.pokeClock()
        transportPreviousPreset()
        return
      }

      if (matchesFootPedalKey(event, UNIVERSAL_VOLUME_UP_KEYS)) {
        event.preventDefault()
        event.stopPropagation()
        void droneEngine.pokeClock()
        transportVolumeUp()
        return
      }

      if (matchesFootPedalKey(event, UNIVERSAL_VOLUME_DOWN_KEYS)) {
        event.preventDefault()
        event.stopPropagation()
        void droneEngine.pokeClock()
        transportVolumeDown()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    if (!needsIosMediaRemoteIntegration()) {
      return
    }

    const anchor = mediaAnchorRef.current
    if (!anchor) {
      return
    }

    recordBleDebug('note', `bt mode=${btControlMode}`)

    const setActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // iOS Safari can reject unsupported handlers.
      }
    }

    const setupPedalMediaSession = () => {
      setActionHandler('play', () => {
        recordBleDebug('mediasession', `pedal play (playing=${useDroneStore.getState().playing})`)
        runMediaSessionAction(() => {
          if (useDroneStore.getState().playing) {
            transportPause()
            return
          }
          transportPlay(latestRuntimeConfigRef.current)
          if (anchor.paused) {
            void anchor.play().catch(() => {})
          }
        })
      })
      setActionHandler('pause', () => {
        recordBleDebug('mediasession', 'pedal pause')
        runMediaSessionAction(transportPause)
      })
      setActionHandler('nexttrack', () => {
        recordBleDebug('mediasession', 'pedal nexttrack')
        runMediaSessionAction(() => {
          void droneEngine.pokeClock()
          transportNextPreset()
        })
      })
      setActionHandler('previoustrack', () => {
        recordBleDebug('mediasession', 'pedal previoustrack')
        runMediaSessionAction(() => {
          void droneEngine.pokeClock()
          transportPreviousPreset()
        })
      })
    }

    const setupSpeakerMediaSession = () => {
      setActionHandler('play', () => {
        recordBleDebug('mediasession', `speaker play (playing=${useDroneStore.getState().playing})`)
        if (wasMediaSessionHandledRecently('play')) {
          return
        }
        markMediaSessionAction('play')
        runMediaSessionAction(() => {
          if (useDroneStore.getState().playing) {
            return
          }
          clipRemoteHoldRef.current = false
          transportPlayFromRemote(latestRuntimeConfigRef.current)
          if (anchor.paused) {
            void anchor.play().catch(() => {})
          }
        })
      })
      setActionHandler('pause', () => {
        recordBleDebug('mediasession', `speaker pause (playing=${useDroneStore.getState().playing})`)
        if (wasMediaSessionHandledRecently('pause')) {
          return
        }
        markMediaSessionAction('pause')
        runMediaSessionAction(() => {
          if (!useDroneStore.getState().playing) {
            return
          }
          clipRemoteHoldRef.current = true
          transportPauseFromRemote()
          anchor.pause()
        })
      })
      setActionHandler('nexttrack', () => {
        recordBleDebug('mediasession', 'speaker nexttrack')
        runMediaSessionAction(() => {
          void droneEngine.pokeClock()
          transportNextPreset()
        })
      })
      setActionHandler('previoustrack', () => {
        recordBleDebug('mediasession', 'speaker previoustrack')
        runMediaSessionAction(() => {
          void droneEngine.pokeClock()
          transportPreviousPreset()
        })
      })
    }

    const onPedalAnchorPause = () => {
      recordBleDebug('note', 'pedal anchor paused (restarting)')
      void anchor.play().then(() => setMediaSessionPlaybackState(true)).catch(() => {})
    }
    const onPedalAnchorPlaying = () => {
      setMediaSessionPlaybackState(true)
    }

    const onSpeakerAnchorPause = () => {
      if (useDroneStore.getState().playing) {
        recordBleDebug('note', 'speaker anchor paused → remote pause')
        clipRemoteHoldRef.current = true
        transportPauseFromRemote()
        return
      }
      if (clipRemoteHoldRef.current) {
        recordBleDebug('note', 'speaker anchor paused (clip hold)')
        return
      }
      recordBleDebug('note', 'speaker anchor paused (drone idle)')
      setMediaSessionPlaybackState(false)
    }
    const onSpeakerAnchorPlaying = () => {
      const resumeFromClipRemote = clipRemoteHoldRef.current
      clipRemoteHoldRef.current = false
      if (resumeFromClipRemote && !useDroneStore.getState().playing) {
        recordBleDebug('note', 'speaker anchor playing → remote play')
        markMediaSessionAction('play')
        transportPlayFromRemote(latestRuntimeConfigRef.current)
        return
      }
      if (useDroneStore.getState().playing) {
        setMediaSessionPlaybackState(true)
      }
    }

    let onAnchorPause: () => void
    let onAnchorPlaying: () => void
    if (btControlMode === 'pedal') {
      clipRemoteHoldRef.current = false
      onAnchorPause = onPedalAnchorPause
      onAnchorPlaying = onPedalAnchorPlaying
      setupPedalMediaSession()
    } else {
      clipRemoteHoldRef.current = false
      setMediaSessionPlaybackState(useDroneStore.getState().playing)
      onAnchorPause = onSpeakerAnchorPause
      onAnchorPlaying = onSpeakerAnchorPlaying
      setupSpeakerMediaSession()
    }

    anchor.addEventListener('pause', onAnchorPause)
    anchor.addEventListener('playing', onAnchorPlaying)

    const maintainSession = () => {
      if (useDroneStore.getState().playing) {
        void droneEngine.pokeClock()
      }
      if (btControlMode === 'pedal') {
        maintainPedalAnchor(anchor)
      } else {
        maintainSpeakerAnchor(anchor, clipRemoteHoldRef)
      }
    }

    maintainSession()
    const intervalId = window.setInterval(maintainSession, 1500)

    const onVisibilityChange = () => {
      if (document.hidden) {
        return
      }
      void droneEngine.pokeClock()
      maintainSession()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    let onPedalKeyDown: ((event: KeyboardEvent) => void) | null = null
    if (btControlMode === 'pedal') {
      onPedalKeyDown = (event: KeyboardEvent) => {
        recordBleDebug(
          'keydown',
          `key=${event.key} code=${event.code} hasFocus=${document.hasFocus()} active=${
            document.activeElement?.tagName ?? 'none'
          }`,
        )
        if (isTextEditingTarget(event.target)) {
          return
        }

        const isPlayPedal = matchesFootPedalKey(event, FOOT_PEDAL_PLAY_KEYS)
        const isPresetPedal = matchesFootPedalKey(event, FOOT_PEDAL_PRESET_KEYS)

        if (isPlayPedal || isPresetPedal) {
          void droneEngine.pokeClock()
        }

        if (isPlayPedal || isPresetPedal) {
          if (event.repeat) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          event.stopPropagation()
        }

        if (isPlayPedal) {
          handleTogglePlay()
          return
        }

        if (matchesFootPedalKey(event, MEDIA_TRACK_PREVIOUS_KEYS)) {
          if (event.repeat) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          void droneEngine.pokeClock()
          transportPreviousPreset()
          return
        }

        if (matchesFootPedalKey(event, MEDIA_TRACK_NEXT_KEYS)) {
          if (event.repeat) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          void droneEngine.pokeClock()
          transportNextPreset()
          return
        }

        if (isPresetPedal) {
          handlePresetPedalPress()
          return
        }

        if (event.code === 'Space' || event.key === ' ') {
          event.preventDefault()
          handleTogglePlay()
          return
        }
        if (matchesFootPedalKey(event, MEDIA_PLAY_PAUSE_KEYS)) {
          event.preventDefault()
          handleTogglePlay()
          return
        }
        if (matchesFootPedalKey(event, MEDIA_PLAY_KEYS)) {
          event.preventDefault()
          transportResume(latestRuntimeConfigRef.current)
          return
        }
        if (matchesFootPedalKey(event, MEDIA_PAUSE_KEYS)) {
          event.preventDefault()
          transportPause()
        }
      }
      window.addEventListener('keydown', onPedalKeyDown, true)
    }

    return () => {
      anchor.removeEventListener('pause', onAnchorPause)
      anchor.removeEventListener('playing', onAnchorPlaying)
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (onPedalKeyDown) {
        window.removeEventListener('keydown', onPedalKeyDown, true)
      }
      setActionHandler('play', null)
      setActionHandler('pause', null)
      setActionHandler('nexttrack', null)
      setActionHandler('previoustrack', null)
    }
  }, [btControlMode, handleTogglePlay, handlePresetPedalPress, latestRuntimeConfigRef])

  useEffect(() => {
    if (btControlMode !== 'speaker' || !needsIosMediaRemoteIntegration()) {
      return
    }
    setMediaSessionPlaybackState(playing)
    if (!playing) {
      return
    }
    clipRemoteHoldRef.current = false
    const anchor = mediaAnchorRef.current
    if (anchor?.paused) {
      void anchor.play().catch(() => {})
    }
  }, [btControlMode, playing])

  return mediaAnchorRef
}
