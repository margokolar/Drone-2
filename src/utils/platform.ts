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

export function isEmbeddedFrame(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
