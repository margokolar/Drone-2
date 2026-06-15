import { markMediaSessionActionHandled } from './mediaRemoteDedupe'
import { isIosDevice } from './platform'

export const BLE_KEYBOARD_FOCUS_ROOT_ID = 'ble-keyboard-focus-root'

/** After iOS handles a Now Playing / media-remote action, route BLE keyboard back to the page. */
export function restoreBleKeyboardFocus(): void {
  if (typeof document === 'undefined') {
    return
  }

  const active = document.activeElement
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    active.blur()
  }

  // iOS bug: programmatically focusing a hidden, non-text element while a
  // Bluetooth HID keyboard (BlueTurn) is connected can wedge the system
  // keyboard across every app until the phone is restarted. Media Session
  // handlers fire regardless of DOM focus on iOS, so we must never grab focus.
  if (isIosDevice()) {
    return
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
  markMediaSessionActionHandled()
  action()
  queueBleKeyboardFocusRecovery()
}
