import { useEffect } from 'react'
import { metronomeEngine } from '../audio/MetronomeEngine'

type MetronomeConfig = {
  enabled: boolean
  bpm: number
  volumeDb: number
  muted: boolean
}

export function useMetronome(config: MetronomeConfig): void {
  const { enabled, bpm, volumeDb, muted } = config
  useEffect(() => {
    void metronomeEngine.setConfig({ enabled, bpm, volumeDb, muted })
  }, [bpm, enabled, muted, volumeDb])
}
