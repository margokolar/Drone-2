import { useEffect } from 'react'
import { metronomeEngine } from '../audio/MetronomeEngine'

type MetronomeConfig = {
  enabled: boolean
  bpm: number
  volumeDb: number
}

export function useMetronome(config: MetronomeConfig): void {
  useEffect(() => {
    void metronomeEngine.setConfig(config)
  }, [config])
}
