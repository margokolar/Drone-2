/**
 * Web: `navigator.audioSession` playback so Safari ignores the silent switch.
 * Native iOS: AVAudioSession playback + mixWithOthers (Drone + Just Keys together).
 * Do not set navigator.audioSession to exclusive `playback` in the Capacitor shell —
 * WKWebView would undo mixWithOthers.
 */

import { Capacitor } from '@capacitor/core'
import { AudioSession } from '../native/audioSession'

export type IosAudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record'

type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type: IosAudioSessionType
  }
}

export function setIosAudioSessionType(type: IosAudioSessionType): void {
  if (Capacitor.isNativePlatform()) {
    if (type === 'play-and-record') {
      void AudioSession.configurePlayAndRecord().catch(() => {})
      return
    }
    void AudioSession.configurePlayback().catch(() => {})
    return
  }
  const audioSession = (navigator as NavigatorWithAudioSession).audioSession
  if (!audioSession) {
    return
  }
  try {
    audioSession.type = type
  } catch {
    // Some browsers expose the API but reject writes.
  }
}

/** Claim a mixable playback session (native) or Safari playback (PWA). */
export function claimMixableAudioSession(): void {
  setIosAudioSessionType('playback')
}
