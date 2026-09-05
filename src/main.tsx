import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import '@fontsource/noto-music/music-400.css'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

async function setupServiceWorker() {
  // Native Capacitor builds ship a fresh web bundle on each deploy. A PWA
  // service worker here would cache stale UI (e.g. old landscape layouts).
  if (Capacitor.isNativePlatform()) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    return
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return
      }
      void registration.update()
      setInterval(() => {
        void registration.update()
      }, 60 * 60 * 1000)
    },
  })
}

void setupServiceWorker()

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

sessionStorage.removeItem('drone-boot-reload')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
