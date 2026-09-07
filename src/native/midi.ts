import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type MidiEndpoint = {
  id: number
  name: string
}

export type MidiProgramChangeEvent = {
  type: 'programChange'
  channel: number
  program: number
  sourceId?: number
}

export type MidiControlChangeEvent = {
  type: 'controlChange'
  channel: number
  controller: number
  value: number
  sourceId?: number
}

export type MidiMessageEvent = MidiProgramChangeEvent | MidiControlChangeEvent

export type MidiPlugin = {
  listDestinations(): Promise<{ destinations: MidiEndpoint[] }>
  listSources(): Promise<{ sources: MidiEndpoint[] }>
  sendProgramChange(options: {
    destinationId: number
    program: number
    channel?: number
  }): Promise<{ sent: boolean; program: number; channel: number }>
  sendProgramChangeToScribble(options: {
    program: number
    channel?: number
    sourceId?: number
  }): Promise<{
    sent: boolean
    program: number
    channel: number
    destinationId: number
    destinationCount: number
  }>
  findDestinationForSource(options: {
    sourceId: number
  }): Promise<{ destinationId: number; name: string; count: number }>
  startListening(options?: { sourceId?: number }): Promise<{ listening: boolean }>
  stopListening(): Promise<{ listening: boolean }>
  showBluetoothMidiPicker(): Promise<{ presented: boolean }>
  addListener(
    eventName: 'midiMessage',
    listenerFunc: (event: MidiMessageEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const Midi = registerPlugin<MidiPlugin>('Midi')
