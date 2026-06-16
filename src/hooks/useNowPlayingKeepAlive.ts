import { useEffect, type RefObject } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'

/** Keep iOS Now Playing + silent anchor continuously active so BlueTurn keydowns survive idle. */
export function useNowPlayingKeepAlive(
  mediaAnchorRef: RefObject<HTMLAudioElement | null>,
  anchorRemotePauseHoldRef: RefObject<boolean>,
): void {
  useEffect(() => {
    if (!needsIosMediaRemoteIntegration()) {
      return
    }

    const assertPlayingSession = () => {
      const dronePlaying = useDroneStore.getState().playing
      const remoteHold = anchorRemotePauseHoldRef.current && !dronePlaying

      if ('mediaSession' in navigator) {
        try {
          // Clip 5 remote pause must stay visibly paused; BlueTurn local pause keeps
          // playbackState "playing" so HID keydowns still reach the page after idle.
          navigator.mediaSession.playbackState = remoteHold ? 'paused' : 'playing'
        } catch {
          // Ignore browsers that reject the write.
        }
      }

      if (remoteHold) {
        return
      }

      const anchor = mediaAnchorRef.current
      if (anchor?.paused) {
        void anchor.play().catch(() => {})
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
  }, [anchorRemotePauseHoldRef, mediaAnchorRef])
}
