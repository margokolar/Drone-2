/**
 * iOS WKWebView audio focus via `navigator.audioSession`.
 * `ambient` mixes with other apps (e.g. Just Keys); `playback` is exclusive.
 */

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

/** Mixable session so Drone can play alongside Just Keys (and other ambient audio). */
export function claimMixableAudioSession(): void {
  setIosAudioSessionType('ambient')
}
