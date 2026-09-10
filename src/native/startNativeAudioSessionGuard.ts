import { Capacitor } from '@capacitor/core'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import { AudioSession } from './audioSession'

function isOnScreen(): boolean {
  return document.visibilityState === 'visible'
}

/**
 * Capacitor-only: exclusive AVAudioSession while this app is on screen.
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
    if (!isOnScreen()) {
      return
    }
    const playing = useDroneStore.getState().playing
    if (!playing) {
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
    if (!event.shouldResume || !isOnScreen()) {
      return
    }
    scheduleReclaim()
  })

  const routeHandle = await AudioSession.addListener('routeChange', () => {
    if (!isOnScreen()) {
      return
    }
    scheduleReclaim()
  })

  reclaimWebAudio()

  return () => {
    void interruptionHandle.remove()
    void routeHandle.remove()
  }
}
