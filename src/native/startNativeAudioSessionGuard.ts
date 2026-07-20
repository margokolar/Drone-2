import { Capacitor } from '@capacitor/core'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import { AudioSession } from './audioSession'

/**
 * Capacitor-only: claim AVAudioSession and reclaim Web Audio after interruptions.
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

  const reclaimWebAudio = () => {
    const playing = useDroneStore.getState().playing
    if (!playing) {
      void droneEngine.recoverIfStalled()
      return
    }
    void droneEngine.pokeClock().then(() => droneEngine.recoverIfStalled())
  }

  const interruptionHandle = await AudioSession.addListener('interruption', (event) => {
    if (event.type === 'began') {
      return
    }
    if (!event.shouldResume) {
      return
    }
    void AudioSession.activate()
      .catch(() => {})
      .finally(() => {
        reclaimWebAudio()
      })
  })

  const routeHandle = await AudioSession.addListener('routeChange', () => {
    void AudioSession.activate()
      .catch(() => {})
      .finally(() => {
        reclaimWebAudio()
      })
  })

  reclaimWebAudio()

  return () => {
    void interruptionHandle.remove()
    void routeHandle.remove()
  }
}
