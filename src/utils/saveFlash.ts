/** Briefly flash a save button amber to confirm the save action. */
export function triggerSaveFlash(element: HTMLElement | null): void {
  if (!element) {
    return
  }
  element.classList.remove('save-flash')
  // Force reflow so the animation restarts on rapid repeated clicks.
  void element.offsetWidth
  element.classList.add('save-flash')
}
