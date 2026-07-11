import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isEmbeddedFrame, isIosStandalonePwa } from '../utils/platform'

const MOBILE_MAX_WIDTH_PX = 767

function shouldPinMobileChrome(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const narrow = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches
  return !isEmbeddedFrame() && (narrow || isIosStandalonePwa())
}

function updateMobileBrowserViewportVars(): void {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0
  const bottomInset = Math.max(0, window.innerHeight - offsetTop - height)

  document.documentElement.style.setProperty('--app-height', `${height}px`)
  document.documentElement.style.setProperty('--app-offset-top', `${offsetTop}px`)
  document.documentElement.style.setProperty('--vv-bottom-inset', `${bottomInset}px`)
}

function clearMobileViewportVars(): void {
  document.documentElement.style.removeProperty('--app-height')
  document.documentElement.style.removeProperty('--app-offset-top')
  document.documentElement.style.removeProperty('--vv-bottom-inset')
}

export function useMobileTransportDock() {
  const transportFooterRef = useRef<HTMLElement>(null)
  const topChromeRef = useRef<HTMLElement>(null)
  const [pinTransportFooter, setPinTransportFooter] = useState(shouldPinMobileChrome)
  const [transportFooterHeight, setTransportFooterHeight] = useState(0)
  const [topChromeHeight, setTopChromeHeight] = useState(0)
  const iosStandaloneChrome = pinTransportFooter && isIosStandalonePwa()

  useEffect(() => {
    const updatePin = () => {
      setPinTransportFooter(shouldPinMobileChrome())
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

    return () => {
      document.documentElement.classList.remove('ios-standalone-pwa')
      document.body.classList.remove('ios-standalone-pwa')
    }
  }, [])

  useLayoutEffect(() => {
    if (!pinTransportFooter) {
      clearMobileViewportVars()
      return
    }

    const standalone = isIosStandalonePwa()
    const updateViewport = () => {
      if (standalone) {
        clearMobileViewportVars()
        return
      }
      updateMobileBrowserViewportVars()
    }

    updateViewport()

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)
    window.addEventListener('pageshow', updateViewport)

    return () => {
      clearMobileViewportVars()
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
      window.removeEventListener('pageshow', updateViewport)
    }
  }, [pinTransportFooter])

  useEffect(() => {
    if (!pinTransportFooter) {
      return
    }
    document.body.classList.add('mobile-transport-docked')
    return () => {
      document.body.classList.remove('mobile-transport-docked')
    }
  }, [pinTransportFooter])

  const measureChromeHeights = () => {
    const footer = transportFooterRef.current
    if (footer) {
      setTransportFooterHeight(footer.getBoundingClientRect().height)
    }
    const header = topChromeRef.current
    if (header && pinTransportFooter) {
      setTopChromeHeight(header.getBoundingClientRect().height)
    } else {
      setTopChromeHeight(0)
    }
  }

  useLayoutEffect(() => {
    if (!pinTransportFooter || isIosStandalonePwa()) {
      return
    }

    const footer = transportFooterRef.current
    const header = topChromeRef.current
    if (!footer) {
      return
    }

    measureChromeHeights()
    const observers: ResizeObserver[] = []
    const footerObserver = new ResizeObserver(measureChromeHeights)
    footerObserver.observe(footer)
    observers.push(footerObserver)
    if (header) {
      const headerObserver = new ResizeObserver(measureChromeHeights)
      headerObserver.observe(header)
      observers.push(headerObserver)
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect()
      }
    }
  }, [pinTransportFooter])

  return {
    pinTransportFooter,
    iosStandaloneChrome,
    transportFooterRef,
    topChromeRef,
    transportFooterHeight,
    topChromeHeight,
  }
}
