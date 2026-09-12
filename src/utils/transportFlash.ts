/** Briefly glow a transport button when a Bluetooth / media remote fires it. */
export type TransportFlashTarget =
  | 'play'
  | 'preset-prev'
  | 'preset-next'
  | 'song-prev'
  | 'song-next'

export function flashTransport(target: TransportFlashTarget): void {
  const element = document.querySelector<HTMLElement>(`[data-transport="${target}"]`)
  if (!element) {
    return
  }
  element.classList.remove('transport-flash')
  void element.offsetWidth
  element.classList.add('transport-flash')
}
