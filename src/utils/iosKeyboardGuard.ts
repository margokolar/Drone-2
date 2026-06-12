import { isTextEditingTarget } from './footPedalKeys'
import { isIosDevice } from './platform'

/** Blur any focused text field so iOS can tear down the virtual keyboard cleanly. */
export function dismissVirtualKeyboard(): void {
  if (typeof document === 'undefined') {
    return
  }

  const active = document.activeElement
  if (isTextEditingTarget(active)) {
    ;(active as HTMLElement).blur()
  }
}

/**
 * Release ALL programmatic focus (text fields and the hidden BLE focus root).
 *
 * Holding web focus while a Bluetooth keyboard (e.g. BlueTurn) disconnects can
 * wedge the iOS software keyboard system-wide until a device restart. Whenever
 * the app hides, locks, or otherwise expects the BLE link to drop, drop focus
 * back to the document body so nothing is held across the disconnect.
 */
export function releaseKeyboardFocus(): void {
  if (typeof document === 'undefined') {
    return
  }

  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur()
  }
}

/**
 * iOS WebKit can leave the system keyboard wedged after a PWA hides, loses focus,
 * or when a Bluetooth keyboard disconnects mid-focus. Release focus on lifecycle
 * edges so the disconnect never happens while we hold focus.
 */
export function installIosKeyboardGuard(): () => void {
  if (!isIosDevice()) {
    return () => {}
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      releaseKeyboardFocus()
    }
  }

  window.addEventListener('pagehide', releaseKeyboardFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('pagehide', releaseKeyboardFocus)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
