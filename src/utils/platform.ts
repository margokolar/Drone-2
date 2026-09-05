import { Capacitor } from '@capacitor/core'

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isIosStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const isStandalone =
    nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return isIosDevice() && isStandalone
}

export function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Capacitor shell on iPhone/iPad — not Safari PWA, not desktop browser. */
export function isIosApp(): boolean {
  try {
    return Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

/**
 * Tag document root so iOS-only CSS / Tailwind variants never affect the PWA.
 * Call once at startup (main.tsx).
 */
export function applyPlatformBodyClasses(): void {
  if (isCapacitorNative()) {
    document.documentElement.classList.add('capacitor-native')
    document.body.classList.add('capacitor-native')
  }
  if (isIosApp()) {
    document.documentElement.classList.add('ios-app')
    document.body.classList.add('ios-app')
  }
}
