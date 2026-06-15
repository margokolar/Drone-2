import { isIosDevice } from './platform'

export function isEmbeddedPreview(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** iOS Now Playing / BT remote integration — not in desktop browsers or embedded dev previews. */
export function needsIosMediaRemoteIntegration(): boolean {
  return isIosDevice() && !isEmbeddedPreview()
}
