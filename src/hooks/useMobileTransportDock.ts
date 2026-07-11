import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isEmbeddedFrame, isIosStandalonePwa } from '../utils/platform'

const MOBILE_MAX_WIDTH_PX = 767

function shouldPinTransportFooter(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const narrow = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches
  return !isEmbeddedFrame() && (narrow || isIosStandalonePwa())
}

export function useMobileTransportDock() {
  const transportFooterRef = useRef<HTMLElement>(null)
  const [pinTransportFooter, setPinTransportFooter] = useState(shouldPinTransportFooter)
  const [transportFooterHeight, setTransportFooterHeight] = useState(0)

  useEffect(() => {
    const updatePin = () => {
      setPinTransportFooter(shouldPinTransportFooter())
    }
    updatePin()
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`)
    mediaQuery.addEventListener('change', updatePin)
    window.addEventListener('resize', updatePin)
    return () => {
      mediaQuery.removeEventListener('change', updatePin)
      window.removeEventListener('resize', updatePin)
    }
  }, [])

  useLayoutEffect(() => {
    if (!isIosStandalonePwa()) {
      return
    }

    document.documentElement.classList.add('ios-standalone-pwa')
    document.body.classList.add('ios-standalone-pwa')

    const updateViewport = () => {
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${height}px`)
      document.documentElement.style.setProperty('--app-offset-top', `${viewport?.offsetTop ?? 0}px`)
    }

    updateViewport()
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)

    return () => {
      document.documentElement.classList.remove('ios-standalone-pwa')
      document.body.classList.remove('ios-standalone-pwa')
      document.documentElement.style.removeProperty('--app-height')
      document.documentElement.style.removeProperty('--app-offset-top')
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!pinTransportFooter) {
      return
    }
    document.body.classList.add('mobile-transport-docked')
    return () => {
      document.body.classList.remove('mobile-transport-docked')
    }
  }, [pinTransportFooter])

  useLayoutEffect(() => {
    const footer = transportFooterRef.current
    if (!footer) {
      return
    }
    const measure = () => {
      setTransportFooterHeight(footer.getBoundingClientRect().height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [pinTransportFooter])

  return { pinTransportFooter, transportFooterRef, transportFooterHeight }
}
