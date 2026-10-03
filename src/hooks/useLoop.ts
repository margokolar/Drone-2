import { useEffect } from 'react'
import { loopEngine } from '../audio/LoopEngine'
import { cancelPendingLoopQuantize } from '../audio/presetNavigationTransport'
import { ensureLoopSlotLoaded } from '../audio/loopSlotPlayback'
import { useDroneStore } from '../store/useDroneStore'

type LoopRuntimeConfig = {
  enabled: boolean
  volumeDb: number
  muted: boolean
}

export function useLoop(config: LoopRuntimeConfig): void {
  const { enabled, volumeDb, muted } = config
  const songName = useDroneStore((state) => state.songName)
  const songLibrary = useDroneStore((state) => state.songLibrary)
  const activeLoopSlot = useDroneStore((state) => state.activeLoopSlot)
  const loopSlots = useDroneStore((state) => state.loopSlots)
  const songId = songLibrary.find((song) => song.name === songName)?.id
  const activeFileName = loopSlots[activeLoopSlot - 1]

  useEffect(() => {
    cancelPendingLoopQuantize()
  }, [songId])

  useEffect(() => {
    void ensureLoopSlotLoaded(songId, activeLoopSlot)
  }, [activeFileName, activeLoopSlot, songId])

  useEffect(() => {
    void loopEngine.setConfig({ enabled, volumeDb, muted })
  }, [enabled, muted, volumeDb])
}
