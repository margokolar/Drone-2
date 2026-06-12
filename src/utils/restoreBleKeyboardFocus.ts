import { isTextEditingTarget } from './footPedalKeys'
import { dismissVirtualKeyboard } from './iosKeyboardGuard'

export const BLE_KEYBOARD_FOCUS_ROOT_ID = 'ble-keyboard-focus-root'

/** After iOS handles a Now Playing / media-remote action, route BLE keyboard back to the page. */
export function restoreBleKeyboardFocus(): void {
  if (typeof document === 'undefined') {
    return
  }

  const active = document.activeElement
  if (isTextEditingTarget(active)) {
    dismissVirtualKeyboard()
  } else if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    active.blur()
  }

  const root = document.getElementById(BLE_KEYBOARD_FOCUS_ROOT_ID)
  if (root instanceof HTMLElement) {
    root.focus({ preventScroll: true })
    return
  }

  window.focus()
}

export function queueBleKeyboardFocusRecovery(): void {
  requestAnimationFrame(() => {
    restoreBleKeyboardFocus()
  })
}

export function runMediaSessionAction(action: () => void): void {
  action()
  queueBleKeyboardFocusRecovery()
}
