import { describe, expect, it } from 'vitest'
import { normalizeLoopSlotRepeats, withLoopSlotRepeat } from './loopSlots'

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
