/**
 * iOS WKWebView audio focus via `navigator.audioSession`.
 * Use `playback` so audio works with the silent switch and Web Audio stays audible.
 * Native AVAudioSession uses mixWithOthers separately when available.
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

/** Claim a playback session so iOS routes Web Audio (and ignores silent switch). */
export function claimMixableAudioSession(): void {
  setIosAudioSessionType('playback')
}
