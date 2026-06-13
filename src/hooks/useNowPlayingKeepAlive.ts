import { useEffect, type RefObject } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'

/** Keep iOS Now Playing + silent anchor continuously active so BlueTurn keydowns survive idle. */
export function useNowPlayingKeepAlive(mediaAnchorRef: RefObject<HTMLAudioElement | null>): void {
  useEffect(() => {
    const assertPlayingSession = () => {
      const anchor = mediaAnchorRef.current
      if (anchor?.paused) {
        void anchor.play().catch(() => {})
      }
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing'
        } catch {
          // Ignore browsers that reject the write.
        }
      }
    }

    const maintainSession = () => {
      if (useDroneStore.getState().playing) {
        void droneEngine.pokeClock()
      }
      assertPlayingSession()
    }

    const intervalId = window.setInterval(maintainSession, 1500)

    const onVisibilityChange = () => {
      if (document.hidden) {
        return
      }
      void droneEngine.pokeClock()
      maintainSession()
    }

    const onForegroundGesture = () => {
      void droneEngine.pokeClock()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onForegroundGesture)
    window.addEventListener('pointerdown', onForegroundGesture, { passive: true })

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onForegroundGesture)
      window.removeEventListener('pointerdown', onForegroundGesture)
    }
  }, [mediaAnchorRef])
}
