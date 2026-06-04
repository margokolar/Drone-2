import { useEffect, useRef } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import type { DroneRuntimeConfig } from '../audio/types'
import { useDroneStore } from '../store/useDroneStore'

function createSilentWavUrl(): string {
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
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

type UseMediaSessionBridgeOptions = {
  playing: boolean
  getRuntimeConfig: () => DroneRuntimeConfig
}

export function useMediaSessionBridge({ playing, getRuntimeConfig }: UseMediaSessionBridgeOptions): void {
  const anchorRef = useRef<HTMLAudioElement | null>(null)
  const handlersRegisteredRef = useRef(false)
  const getRuntimeConfigRef = useRef(getRuntimeConfig)
  getRuntimeConfigRef.current = getRuntimeConfig

  const registerMediaSessionHandlers = () => {
    if (!('mediaSession' in navigator) || handlersRegisteredRef.current) {
      return
    }
    handlersRegisteredRef.current = true

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

    setActionHandler('play', () => {
      const config = getRuntimeConfigRef.current()
      droneEngine.setPlaybackIntent(true)
      droneEngine.ensureRunning(config)
      useDroneStore.getState().setPlaying(true)
      void anchorRef.current?.play().catch(() => {
        // Lock-screen play may reject until context is warm; foreground recovery retries.
      })
    })
    setActionHandler('pause', () => {
      droneEngine.stop()
      useDroneStore.getState().setPlaying(false)
      anchorRef.current?.pause()
    })
    setActionHandler('nexttrack', () => {
      useDroneStore.getState().selectNextPreset()
    })
    setActionHandler('previoustrack', () => {
      useDroneStore.getState().selectPreviousPreset()
    })
  }

  const recoverForegroundPlayback = () => {
    if (!useDroneStore.getState().playing) {
      return
    }
    void (async () => {
      await droneEngine.recoverIfStalled()
      droneEngine.fastResume(getRuntimeConfigRef.current())
      const anchor = anchorRef.current
      if (anchor?.paused) {
        void anchor.play().catch(() => {
          // May need a tap after long background; next gesture retriggers play.
        })
      }
    })()
  }

  useEffect(() => {
    const silentUrl = createSilentWavUrl()
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
    anchorRef.current = anchor

    const onPlaying = () => {
      registerMediaSessionHandlers()
    }
    anchor.addEventListener('playing', onPlaying)

    const primeAnchor = () => {
      if (!useDroneStore.getState().playing) {
        void anchor.play().then(() => anchor.pause()).catch(() => {
          // iOS can reject before a user gesture; later gestures retry.
        })
      }
    }

    window.addEventListener('pointerdown', primeAnchor, { passive: true })
    window.addEventListener('keydown', primeAnchor)
    window.addEventListener('touchend', primeAnchor, { passive: true })

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverForegroundPlayback()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', recoverForegroundPlayback)
    window.addEventListener('focus', recoverForegroundPlayback)

    return () => {
      anchor.removeEventListener('playing', onPlaying)
      window.removeEventListener('pointerdown', primeAnchor)
      window.removeEventListener('keydown', primeAnchor)
      window.removeEventListener('touchend', primeAnchor)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', recoverForegroundPlayback)
      window.removeEventListener('focus', recoverForegroundPlayback)
      anchor.pause()
      anchor.removeAttribute('src')
      anchor.load()
      anchor.remove()
      URL.revokeObjectURL(silentUrl)
      anchorRef.current = null
      handlersRegisteredRef.current = false

      if ('mediaSession' in navigator) {
        const clear = (action: MediaSessionAction) => {
          try {
            navigator.mediaSession.setActionHandler(action, null)
          } catch {
            // Ignore.
          }
        }
        clear('play')
        clear('pause')
        clear('nexttrack')
        clear('previoustrack')
      }
    }
  }, [])

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) {
      return
    }
    if (playing) {
      if (anchor.paused) {
        void anchor.play().catch(() => {
          // iOS sometimes rejects play() outside a gesture; not fatal.
        })
      }
    } else if (!anchor.paused) {
      anchor.pause()
    }
  }, [playing])

  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    } catch {
      // Ignore browsers that reject the write.
    }
  }, [playing])
}
