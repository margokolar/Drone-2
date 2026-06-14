import type { NoteId } from '../music/notes'

export const TONE_STICKY_CHROME_ID = 'tone-sticky-chrome'

/** Scroll so `element`'s top sits just below the measured sticky header (Tone tab chrome). */
export function scrollBelowStickyChrome(
  element: HTMLElement,
  options?: {
    stickyChromeId?: string
    gutterPx?: number
    behavior?: ScrollBehavior
  },
): void {
  const {
    stickyChromeId = TONE_STICKY_CHROME_ID,
    gutterPx = 8,
    behavior = 'smooth',
  } = options ?? {}

  const sticky = document.getElementById(stickyChromeId)
  const stickyBottom = sticky?.getBoundingClientRect().bottom ?? 0
  const targetTop = element.getBoundingClientRect().top
  const delta = targetTop - stickyBottom - gutterPx

  if (Math.abs(delta) < 1) {
    return
  }

  window.scrollBy({ top: delta, behavior })
}

/** After layout settles (e.g. tab switch), scroll a tone mixer card below the sticky chrome. */
export function scrollToneMixerCardIntoView(
  noteId: NoteId,
  cardIdFor: (noteId: NoteId) => string,
  sectionId: string,
): void {
  const run = () => {
    const card = document.getElementById(cardIdFor(noteId))
    if (card) {
      scrollBelowStickyChrome(card)
      return
    }
    const section = document.getElementById(sectionId)
    if (section) {
      scrollBelowStickyChrome(section)
    }
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run)
  })
}
