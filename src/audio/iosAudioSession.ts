/**
 * Web: `navigator.audioSession` playback so Safari ignores the silent switch.
 * Native iOS: exclusive playback is claimed only while the app is actually
 * sounding, so CarPlay radio keeps Now Playing until Play / click.
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
    }
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

/** Safari playback on PWA. Native iOS waits until play so radio keeps focus. */
export function claimMixableAudioSession(): void {
  if (Capacitor.isNativePlatform()) {
    return
  }
  setIosAudioSessionType('playback')
}

let microphoneHoldsSession = false

export function setMicrophoneSessionHold(on: boolean): void {
  microphoneHoldsSession = on
}

export function microphoneHoldsSessionNow(): boolean {
  return microphoneHoldsSession
}
