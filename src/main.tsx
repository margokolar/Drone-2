import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-music/music-400.css'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

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
