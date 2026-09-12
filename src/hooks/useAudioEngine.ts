import { useEffect, useRef } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import type { DroneRuntimeConfig } from '../audio/types'

export function useAudioEngine(
  config: DroneRuntimeConfig,
  playing: boolean,
  activePresetId: string,
): void {
  const latestConfigRef = useRef<DroneRuntimeConfig>(config)
  const previousPresetIdRef = useRef(activePresetId)
  const songName = useDroneStore((state) => state.songName)
  const previousSongNameRef = useRef(songName)

  useEffect(() => {
    if (
      previousPresetIdRef.current !== activePresetId ||
      previousSongNameRef.current !== songName
    ) {
      droneEngine.markPresetTransition()
      previousPresetIdRef.current = activePresetId
      previousSongNameRef.current = songName
    }
  }, [activePresetId, songName])

  useEffect(() => {
    droneEngine.setPlaybackFadeSettings(
      config.playbackFadeInSeconds ?? 0,
      config.playbackFadeOutSeconds ?? 0,
      config.presetCrossfadeSeconds ?? 0,
    )
  }, [config.playbackFadeInSeconds, config.playbackFadeOutSeconds, config.presetCrossfadeSeconds])

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
      droneEngine.clearPresetTransition()
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
