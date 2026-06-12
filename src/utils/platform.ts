export function isIosStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const isIosDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return isIosDevice && isStandalone
}
