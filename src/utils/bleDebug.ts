export type BleDebugSource = 'mediasession' | 'keydown' | 'note'

export type BleDebugEvent = {
  t: number
  seq: number
  source: BleDebugSource
  label: string
}

let events: BleDebugEvent[] = []
let seqCounter = 0
const listeners = new Set<() => void>()

/** Temporary BlueTurn / Media Session diagnostics, gated behind ?debug=1. */
export function bleDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export function recordBleDebug(source: BleDebugSource, label: string): void {
  if (!bleDebugEnabled()) {
    return
  }
  seqCounter += 1
  events = [{ t: Date.now(), seq: seqCounter, source, label }, ...events].slice(0, 14)
  listeners.forEach((listener) => listener())
}

export function getBleDebugEvents(): BleDebugEvent[] {
  return events
}

export function subscribeBleDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
