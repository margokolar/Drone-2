import { LOOP_SLOTS, loopSlotKey, type LoopSlot } from './loopSlots'

const DB_NAME = 'drone-loop-audio'
const DB_VERSION = 1
const STORE_NAME = 'files'

export type StoredLoopAudio = {
  fileName: string
  blob: Blob
}

function openLoopDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open loop audio storage'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Loop audio storage failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Loop audio storage failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Loop audio storage aborted'))
  })
}

function asStoredLoopAudio(stored: unknown): StoredLoopAudio | null {
  if (!stored || typeof stored !== 'object') {
    return null
  }
  const record = stored as Partial<StoredLoopAudio>
  if (!(record.blob instanceof Blob) || typeof record.fileName !== 'string') {
    return null
  }
  return { fileName: record.fileName, blob: record.blob }
}

export async function getLoopAudio(songId: string, slot: LoopSlot = 1): Promise<StoredLoopAudio | null> {
  const db = await openLoopDb()
  try {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const slottedRequest = store.get(loopSlotKey(songId, slot))
    const legacyRequest = slot === 1 ? store.get(songId) : null
    const slotted = asStoredLoopAudio(await requestToPromise(slottedRequest))
    if (slotted) {
      return slotted
    }
    if (!legacyRequest) {
      return null
    }
    return asStoredLoopAudio(await requestToPromise(legacyRequest))
  } finally {
    db.close()
  }
}

export async function putLoopAudio(
  songId: string,
  slot: LoopSlot,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const db = await openLoopDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ fileName, blob }, loopSlotKey(songId, slot))
    if (slot === 1) {
      store.delete(songId)
    }
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function deleteLoopSlotAudio(songId: string, slot: LoopSlot): Promise<void> {
  const db = await openLoopDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(loopSlotKey(songId, slot))
    if (slot === 1) {
      store.delete(songId)
    }
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function deleteLoopAudio(songId: string): Promise<void> {
  const db = await openLoopDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(songId)
    for (const slot of LOOP_SLOTS) {
      store.delete(loopSlotKey(songId, slot))
    }
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function copyLoopAudio(fromSongId: string, toSongId: string): Promise<void> {
  if (fromSongId === toSongId) {
    return
  }
  for (const slot of LOOP_SLOTS) {
    const stored = await getLoopAudio(fromSongId, slot)
    if (!stored) {
      await deleteLoopSlotAudio(toSongId, slot)
      continue
    }
    await putLoopAudio(toSongId, slot, stored.fileName, stored.blob)
  }
}
