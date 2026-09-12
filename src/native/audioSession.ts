import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type AudioInterruptionEvent = {
  type: 'began' | 'ended'
  shouldResume: boolean
  source?: string
}

export type AudioRouteChangeEvent = {
  reason: string
}

export type AudioRemoteCommandEvent = {
  action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'volup' | 'voldown' | string
}

export type AudioSessionPlugin = {
  configurePlayback(): Promise<{ category: string }>
  configurePlayAndRecord(): Promise<{ category: string }>
  activate(): Promise<{ active: boolean }>
  deactivate(): Promise<{ active: boolean }>
  setKeepAwake(options: { on: boolean }): Promise<{ on: boolean }>
  setNowPlaying(options: {
    title: string
    artist: string
    sequence?: string[]
    activeIndex?: number
  }): Promise<void>
  addListener(
    eventName: 'interruption',
    listenerFunc: (event: AudioInterruptionEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'routeChange',
    listenerFunc: (event: AudioRouteChangeEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'remoteCommand',
    listenerFunc: (event: AudioRemoteCommandEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession')
