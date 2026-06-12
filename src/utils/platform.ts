export function isIosDevice(): boolean {
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
