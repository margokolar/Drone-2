const DEDUPE_MS = 120

export type MediaRemoteAction = 'play' | 'pause' | 'next' | 'prev'

let lastHandled: { t: number; action: MediaRemoteAction } | null = null

export function markMediaSessionAction(action: MediaRemoteAction): void {
  lastHandled = { t: Date.now(), action }
}

/** Skip duplicate keyboard media keys when iOS already delivered the same action via MediaSession. */
export function wasMediaSessionHandledRecently(action: MediaRemoteAction): boolean {
  if (!lastHandled || lastHandled.action !== action) {
    return false
  }
  return Date.now() - lastHandled.t < DEDUPE_MS
}
