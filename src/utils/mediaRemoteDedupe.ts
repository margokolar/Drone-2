const DEDUPE_MS = 450

let lastMediaSessionActionAt = 0

export function markMediaSessionActionHandled(): void {
  lastMediaSessionActionAt = Date.now()
}

/** Skip duplicate keyboard media keys when iOS already delivered the same action via MediaSession. */
export function wasMediaSessionHandledRecently(): boolean {
  return Date.now() - lastMediaSessionActionAt < DEDUPE_MS
}
