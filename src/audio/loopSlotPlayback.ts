import { loopEngine } from './LoopEngine'
import { getLoopAudio } from './loopAudioStore'
import { loopSlotKey, type LoopSlot } from './loopSlots'

let loadedKey: string | null = null
let loadGeneration = 0
let inFlight: { key: string; promise: Promise<boolean> } | null = null

export function loadedPlaybackSlot(): LoopSlot | null {
  if (!loadedKey) {
    return null
  }
  const match = loadedKey.match(/:([123])$/)
  if (!match) {
    return null
  }
  return Number(match[1]) as LoopSlot
}

export function markLoopSlotLoaded(songId: string, slot: LoopSlot): void {
  loadedKey = loopSlotKey(songId, slot)
}

export function invalidateLoadedLoopSlot(): void {
  loadGeneration += 1
  loadedKey = null
  inFlight = null
}

export async function ensureLoopSlotLoaded(
  songId: string | undefined,
  slot: LoopSlot,
): Promise<boolean> {
  if (!songId) {
    loadGeneration += 1
    inFlight = null
    loadedKey = null
    loopEngine.clear()
    return false
  }
  const key = loopSlotKey(songId, slot)
  if (loadedKey === key && loopEngine.hasAudio()) {
    return true
  }
  if (inFlight && inFlight.key === key) {
    return inFlight.promise
  }
  const gen = ++loadGeneration
  const promise = (async () => {
    const stored = await getLoopAudio(songId, slot)
    if (gen !== loadGeneration) {
      return false
    }
    if (!stored) {
      loadedKey = null
      loopEngine.clear()
      return false
    }
    await loopEngine.loadBlob(stored.blob)
    if (gen !== loadGeneration) {
      return false
    }
    loadedKey = key
    return true
  })()
  inFlight = { key, promise }
  try {
    return await promise
  } finally {
    if (inFlight?.promise === promise) {
      inFlight = null
    }
  }
}
