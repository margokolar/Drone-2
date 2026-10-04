/** Swallow the click/pointerup that follows a long press so it does not also trigger a tap. */
export function suppressTrailingClickAfterLongPress() {
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const options: AddEventListenerOptions = { capture: true }
  window.addEventListener('click', swallow, options)
  window.addEventListener('pointerup', swallow, options)
  window.addEventListener('mouseup', swallow, options)
  window.setTimeout(() => {
    window.removeEventListener('click', swallow, options)
    window.removeEventListener('pointerup', swallow, options)
    window.removeEventListener('mouseup', swallow, options)
  }, 500)
}
