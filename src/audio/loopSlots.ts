export const LOOP_SLOTS = [1, 2, 3] as const
export type LoopSlot = (typeof LOOP_SLOTS)[number]
export type LoopSlotFiles = [string | null, string | null, string | null]

export function emptyLoopSlots(): LoopSlotFiles {
  return [null, null, null]
}

export function normalizeLoopSlot(value: unknown): LoopSlot | null {
  if (value === 1 || value === 2 || value === 3) {
    return value
  }
  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as LoopSlot
  }
  return null
}

export function normalizeLoopSlots(slots: unknown, fallbackFileName?: string | null): LoopSlotFiles {
  if (Array.isArray(slots) && slots.length >= 3) {
    return [
      typeof slots[0] === 'string' && slots[0] ? slots[0] : null,
      typeof slots[1] === 'string' && slots[1] ? slots[1] : null,
      typeof slots[2] === 'string' && slots[2] ? slots[2] : null,
    ]
  }
  return [typeof fallbackFileName === 'string' && fallbackFileName ? fallbackFileName : null, null, null]
}

export function loopSlotKey(songId: string, slot: LoopSlot): string {
  return `${songId}:${slot}`
}

export function loopSlotFileName(slots: LoopSlotFiles, slot: LoopSlot): string | null {
  return slots[slot - 1]
}

export function loopSlotLabel(slot: LoopSlot): string {
  return `L${slot}`
}

export function loadedLoopSlots(slots: LoopSlotFiles): LoopSlot[] {
  return LOOP_SLOTS.filter((slot) => Boolean(slots[slot - 1]))
}

export function nextLoopSyncSlot(current: LoopSlot | null, loaded: LoopSlot[]): LoopSlot | null {
  if (loaded.length === 0) {
    return null
  }
  if (current == null) {
    return loaded[0]
  }
  const index = loaded.indexOf(current)
  if (index < 0) {
    return loaded[0]
  }
  if (index >= loaded.length - 1) {
    return null
  }
  return loaded[index + 1]
}

export function presetLoopSyncSlot(preset: {
  loopSyncSlot?: LoopSlot | null
  loopSyncEnabled?: boolean
} | null | undefined): LoopSlot | null {
  if (!preset) {
    return null
  }
  const slot = normalizeLoopSlot(preset.loopSyncSlot)
  if (slot != null) {
    return slot
  }
  return preset.loopSyncEnabled ? 1 : null
}

export function withMigratedPresetLoopSync<
  T extends { loopSyncEnabled?: boolean; loopSyncSlot?: LoopSlot | null },
>(preset: T): T {
  const slot = presetLoopSyncSlot(preset)
  return {
    ...preset,
    loopSyncSlot: slot,
    loopSyncEnabled: slot != null,
  }
}
