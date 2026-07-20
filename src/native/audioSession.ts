import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type AudioInterruptionEvent = {
  type: 'began' | 'ended'
  shouldResume: boolean
  source?: string
}

export type AudioRouteChangeEvent = {
  reason: string
}

export type AudioSessionPlugin = {
  configurePlayback(): Promise<{ category: string }>
  configurePlayAndRecord(): Promise<{ category: string }>
  activate(): Promise<{ active: boolean }>
  deactivate(): Promise<{ active: boolean }>
  addListener(
    eventName: 'interruption',
    listenerFunc: (event: AudioInterruptionEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'routeChange',
    listenerFunc: (event: AudioRouteChangeEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession')
