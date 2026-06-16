import { useEffect, useRef } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import type { DroneRuntimeConfig } from '../audio/types'

export function useAudioEngine(config: DroneRuntimeConfig, playing: boolean): void {
  const latestConfigRef = useRef<DroneRuntimeConfig>(config)

  useEffect(() => {
    if (playing) {
      return
    }
    droneEngine.setPlaybackIntent(false)
    droneEngine.pause()
  }, [playing])

  useEffect(() => {
    droneEngine.setPlaybackIntent(playing)
    latestConfigRef.current = config
    if (!playing) {
      return
    }
    if (droneEngine.consumeGesturePlayback()) {
      return
    }
    droneEngine.syncConfig(config, false)
  }, [config, playing])

  useEffect(() => {
    if (!playing) {
      return
    }
    if (droneEngine.isReadyForInstantResume()) {
      return
    }
    void droneEngine.start(latestConfigRef.current)
  }, [playing])
}
