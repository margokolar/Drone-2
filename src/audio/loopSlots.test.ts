import { describe, expect, it } from 'vitest'
import { nextLoopSyncSlot, normalizeLoopSlotRepeats, withLoopSlotRepeat } from './loopSlots'

describe('loop slot Loop/Once flags', () => {
  it('keeps three independent flags', () => {
    expect(normalizeLoopSlotRepeats([true, false, true])).toEqual([true, false, true])
  })

  it('turns the old single switch into the same setting on all three slots', () => {
    expect(normalizeLoopSlotRepeats(false)).toEqual([false, false, false])
    expect(normalizeLoopSlotRepeats(undefined, false)).toEqual([false, false, false])
    expect(normalizeLoopSlotRepeats(undefined)).toEqual([true, true, true])
  })

  it('changes only the chosen slot', () => {
    expect(withLoopSlotRepeat([true, true, true], 2, false)).toEqual([true, false, true])
  })
})

describe('nextLoopSyncSlot', () => {
  it('starts at the first loaded loop', () => {
    expect(nextLoopSyncSlot(null, [2, 3])).toBe(2)
  })

  it('advances to the next loaded loop', () => {
    expect(nextLoopSyncSlot(1, [1, 3])).toBe(3)
  })

  it('turns the link off after the last loaded loop', () => {
    expect(nextLoopSyncSlot(1, [1])).toBeNull()
    expect(nextLoopSyncSlot(3, [1, 3])).toBeNull()
  })

  it('stays off when nothing is loaded', () => {
    expect(nextLoopSyncSlot(1, [])).toBeNull()
    expect(nextLoopSyncSlot(null, [])).toBeNull()
  })
})
