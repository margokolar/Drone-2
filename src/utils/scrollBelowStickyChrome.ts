import type { NoteId } from '../music/notes'

export const TONE_STICKY_CHROME_ID = 'tone-sticky-chrome'
export const STICKY_CHROME_BOTTOM_VAR = '--sticky-chrome-bottom'
export const PRESETS_SECTION_HEADER_HEIGHT_VAR = '--presets-section-header-height'
export const PRESETS_SECTION_CARD_ID = 'presets-section-card'

/** Keep CSS sticky offsets aligned with the measured Tone tab chrome height. */
export function syncStickyChromeLayoutOffsets(options?: {
  stickyChromeId?: string
  presetsSectionCardId?: string
}): void {
  const {
    stickyChromeId = TONE_STICKY_CHROME_ID,
    presetsSectionCardId = PRESETS_SECTION_CARD_ID,
  } = options ?? {}

  const root = document.documentElement
  const chrome = document.getElementById(stickyChromeId)
  const chromeRect = chrome?.getBoundingClientRect()

  if (chromeRect && chromeRect.height > 0) {
    root.style.setProperty(STICKY_CHROME_BOTTOM_VAR, `${chromeRect.bottom}px`)
  } else {
    root.style.removeProperty(STICKY_CHROME_BOTTOM_VAR)
  }

  const presetsHeader = document.querySelector(`#${presetsSectionCardId} > header`)
  if (presetsHeader instanceof HTMLElement) {
    root.style.setProperty(
      PRESETS_SECTION_HEADER_HEIGHT_VAR,
      `${presetsHeader.getBoundingClientRect().height}px`,
    )
  } else {
    root.style.removeProperty(PRESETS_SECTION_HEADER_HEIGHT_VAR)
  }
}

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
