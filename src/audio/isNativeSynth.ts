import { Capacitor } from '@capacitor/core'

/** Capacitor iOS app plays through AVAudioEngine — never create AudioContext. */
export function isNativeSynth(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
