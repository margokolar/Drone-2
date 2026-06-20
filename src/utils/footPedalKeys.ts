/** iRig BlueTurn (HID keyboard) — parem pedaal play/pause, vasak preset next/prev. */
export const FOOT_PEDAL_PLAY_KEYS = new Set([
  'ArrowDown',
  'ArrowRight',
  'NumpadSubtract',
  'Minus',
])

export const FOOT_PEDAL_PRESET_KEYS = new Set([
  'ArrowUp',
  'ArrowLeft',
  'NumpadAdd',
  'Equal',
])

/** PT pedal — PageUp/PageDown direct preset prev/next (no double-tap window). */
export const PT_PEDAL_NEXT_KEYS = new Set(['PageUp'])
export const PT_PEDAL_PREVIOUS_KEYS = new Set(['PageDown'])

/** Universal in both BT modes — master gain only, never play/preset. */
export const UNIVERSAL_VOLUME_UP_KEYS = new Set(['AudioVolumeUp', 'VolumeUp'])
export const UNIVERSAL_VOLUME_DOWN_KEYS = new Set(['AudioVolumeDown', 'VolumeDown'])

export const MEDIA_PLAY_PAUSE_KEYS = new Set(['MediaPlayPause'])
export const MEDIA_PLAY_KEYS = new Set(['MediaPlay'])
export const MEDIA_PAUSE_KEYS = new Set(['MediaPause'])
export const MEDIA_TRACK_NEXT_KEYS = new Set(['MediaTrackNext'])
export const MEDIA_TRACK_PREVIOUS_KEYS = new Set(['MediaTrackPrevious'])

const FOOT_PEDAL_KEY_CODES: Record<string, number> = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  PageUp: 33,
  PageDown: 34,
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url'])

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  if (target instanceof HTMLTextAreaElement) {
    return true
  }
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type)
  }
  return false
}

/** Match by physical code first; iOS BT pedals often send key "Unidentified". */
export function matchesFootPedalKey(event: KeyboardEvent, keys: Set<string>): boolean {
  if (keys.has(event.code)) {
    return true
  }
  const key = event.key
  if (key && key !== 'Unidentified' && keys.has(key)) {
    return true
  }
  if (typeof event.keyCode === 'number' && event.keyCode !== 0) {
    for (const pedalKey of keys) {
      if (FOOT_PEDAL_KEY_CODES[pedalKey] === event.keyCode) {
        return true
      }
    }
  }
  return false
}
