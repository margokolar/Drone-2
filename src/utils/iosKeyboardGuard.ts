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
 * iOS WebKit can leave the system keyboard wedged after a PWA hides, loses focus,
 * or fights over focus with media-session handlers. Dismiss on lifecycle edges.
 */
export function installIosKeyboardGuard(): () => void {
  if (!isIosDevice()) {
    return () => {}
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      dismissVirtualKeyboard()
    }
  }

  window.addEventListener('pagehide', dismissVirtualKeyboard)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('pagehide', dismissVirtualKeyboard)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
