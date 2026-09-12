import { registerPlugin } from '@capacitor/core'

export type NativeDroneOsc = {
  id: string
  freq: number
  gain: number
  pan: number
  wave: 0 | 1 | 2
  glideFrom?: number
  glideSeconds?: number
}

export type NativeShinePartial = {
  freq: number
  gain: number
  pan: number
}

export type NativeDroneSynthPlugin = {
  reclaim(): Promise<{ active: boolean }>
  park(): Promise<{ active: boolean }>
  setGraph(options: {
    master: number
    fadeSeconds: number
    fadeInSeconds?: number
    fadeOutSeconds?: number
    packed: string
  }): Promise<void>
  fadeMaster(options: { target: number; seconds: number }): Promise<void>
  mute(): Promise<void>
  click(options: { frequency: number; peak: number }): Promise<void>
  setMetronome(options: {
    on?: number
    enabled?: boolean
    bpm: number
    volumeDb: number
    mute?: number
    muted?: boolean
  }): Promise<void>
  setShine(options: { packed: string }): Promise<void>
  clearShine(): Promise<void>
}

export const DroneSynth = registerPlugin<NativeDroneSynthPlugin>('DroneSynth')
