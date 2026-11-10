import { describe, expect, it } from 'vitest'
import type { LoopSlotFiles } from '../audio/loopSlots'
import type { Preset } from './defaultPresets'
import {
  getEnabledNavigationEntries,
  navigationEntryKey,
  normalizePresetNavigation,
  selectNextInRing,
  selectPreviousInRing,
  shouldClickFollowTransport,
  shouldLoopFollowTransport,
  withMirroredClickSync,
  type PresetNavigationEntry,
} from './presetNavigation'

function preset(id: string, enabled?: boolean): Preset {
  return { id, name: id, enabled } as Preset
}

const presets = [preset('p1'), preset('p2'), preset('p3')]

describe('normalizePresetNavigation', () => {
  it('drops unknown and duplicate presets and appends missing ones', () => {
    const navigation: PresetNavigationEntry[] = [
      { kind: 'preset', presetId: 'p2' },
      { kind: 'preset', presetId: 'gone' },
      { kind: 'preset', presetId: 'p2' },
      { kind: 'transport', id: 'm1' },
    ]
    expect(normalizePresetNavigation(navigation, presets).map(navigationEntryKey)).toEqual([
      'p2',
      'm1',
      'p1',
      'p3',
    ])
  })

  it('marks play/pause markers enabled unless explicitly disabled', () => {
    const normalized = normalizePresetNavigation(
      [
        { kind: 'transport', id: 'm1' },
        { kind: 'transport', id: 'm2', enabled: false },
      ],
      presets,
    )
    expect(normalized.slice(0, 2)).toEqual([
      { kind: 'transport', id: 'm1', enabled: true },
      { kind: 'transport', id: 'm2', enabled: false },
    ])
  })

  it('builds the default order when nothing was saved', () => {
    expect(normalizePresetNavigation(undefined, presets).map(navigationEntryKey)).toEqual([
      'p1',
      'p2',
      'p3',
    ])
  })

  it('returns nothing when there are no presets', () => {
    expect(normalizePresetNavigation([{ kind: 'transport', id: 'm1' }], [])).toEqual([])
  })
})

it('getEnabledNavigationEntries skips disabled presets and markers', () => {
  const navigation: PresetNavigationEntry[] = [
    { kind: 'preset', presetId: 'p1' },
    { kind: 'transport', id: 'm1', enabled: false },
    { kind: 'preset', presetId: 'p2' },
    { kind: 'transport', id: 'm2' },
  ]
  const withDisabled = [preset('p1'), preset('p2', false)]
  expect(getEnabledNavigationEntries(navigation, withDisabled).map(navigationEntryKey)).toEqual([
    'p1',
    'm2',
  ])
})

describe('ring navigation', () => {
  const keys = ['a', 'b', 'c']
  const id = (key: string) => key

  it('wraps forwards and backwards', () => {
    expect(selectNextInRing(keys, 'c', id)).toBe('a')
    expect(selectPreviousInRing(keys, 'a', id)).toBe('c')
    expect(selectNextInRing(keys, 'a', id)).toBe('b')
  })

  it('starts from the first item when the current one is unknown', () => {
    expect(selectNextInRing(keys, 'zzz', id)).toBe('a')
    expect(selectPreviousInRing(keys, 'zzz', id)).toBe('a')
  })

  it('does nothing with a single item', () => {
    expect(selectNextInRing(['a'], 'a', id)).toBeUndefined()
  })
})

describe('shouldClickFollowTransport', () => {
  const markerNav: PresetNavigationEntry[] = [
    { kind: 'transport', id: 'm1', metronomeSyncEnabled: true },
    { kind: 'preset', presetId: 'p1' },
    { kind: 'preset', presetId: 'p2' },
  ]
  const markedPresets = [
    { ...preset('p1'), metronomeSyncEnabled: true },
    preset('p2'),
    preset('p3'),
  ]

  it('does not follow when Click tab SYNC is off', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: false,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: markerNav,
        presets: markedPresets,
      }),
    ).toBe(false)
  })

  it('follows globally when SYNC is on and there is no play/pause marker', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: true,
        activeNavigationKey: 'p2',
        activePresetId: 'p2',
        presetNavigation: [
          { kind: 'preset', presetId: 'p1' },
          { kind: 'preset', presetId: 'p2' },
        ],
        presets,
      }),
    ).toBe(true)
  })

  it('follows a preset after a play/pause marker unless that preset turned click off', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: true,
        activeNavigationKey: 'p2',
        activePresetId: 'p2',
        presetNavigation: markerNav,
        presets: markedPresets,
      }),
    ).toBe(true)
  })

  it('still follows Play/Pause when a later preset in the segment had click turned off', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: true,
        activeNavigationKey: 'p2',
        activePresetId: 'p2',
        presetNavigation: markerNav,
        presets: [{ ...preset('p1'), metronomeSyncEnabled: true }, { ...preset('p2'), metronomeSyncEnabled: false }, preset('p3')],
      }),
    ).toBe(true)
  })

  it('does not follow while resting on a play/pause marker', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: true,
        activeNavigationKey: 'm1',
        activePresetId: 'p1',
        presetNavigation: markerNav,
        presets: markedPresets,
      }),
    ).toBe(false)
  })

  it('follows a lit preset metronome after a synced play/pause marker', () => {
    expect(
      shouldClickFollowTransport({
        metronomeSyncEnabled: true,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: markerNav,
        presets: markedPresets,
      }),
    ).toBe(true)
  })
})

describe('shouldLoopFollowTransport', () => {
  const nav: PresetNavigationEntry[] = [
    { kind: 'preset', presetId: 'p1' },
    { kind: 'transport', id: 'm1' },
    { kind: 'preset', presetId: 'p2' },
  ]
  const slots: LoopSlotFiles = ['loop.wav', null, 'c.wav']
  const linked = [
    { ...preset('p1'), loopSyncSlot: 1 as const, loopSyncEnabled: true },
    preset('p2'),
    preset('p3'),
  ]

  it('does not follow when the Repeat mark is off, even if a loop file is loaded', () => {
    expect(
      shouldLoopFollowTransport({
        loopFeaturesEnabled: true,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: nav,
        presets,
        loopSlots: slots,
      }),
    ).toBe(false)
  })

  it('follows when this preset is linked to a loaded loop', () => {
    expect(
      shouldLoopFollowTransport({
        loopFeaturesEnabled: true,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: nav,
        presets: linked,
        loopSlots: slots,
      }),
    ).toBe(true)
  })

  it('does not follow a linked slot that has no file', () => {
    expect(
      shouldLoopFollowTransport({
        loopFeaturesEnabled: true,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: nav,
        presets: [{ ...preset('p1'), loopSyncSlot: 2 as const, loopSyncEnabled: true }, preset('p2')],
        loopSlots: slots,
      }),
    ).toBe(false)
  })

  it('does not follow while resting on a play/pause marker', () => {
    expect(
      shouldLoopFollowTransport({
        loopFeaturesEnabled: true,
        activeNavigationKey: 'm1',
        activePresetId: 'p1',
        presetNavigation: nav,
        presets: linked,
        loopSlots: slots,
      }),
    ).toBe(false)
  })

  it('does not follow when loop features are off', () => {
    expect(
      shouldLoopFollowTransport({
        loopFeaturesEnabled: false,
        activeNavigationKey: 'p1',
        activePresetId: 'p1',
        presetNavigation: nav,
        presets: linked,
        loopSlots: slots,
      }),
    ).toBe(false)
  })
})

describe('withMirroredClickSync', () => {
  it('sets every play/pause marker to the Click tab SYNC state', () => {
    const navigation: PresetNavigationEntry[] = [
      { kind: 'transport', id: 'm1', metronomeSyncEnabled: true },
      { kind: 'preset', presetId: 'p1' },
      { kind: 'transport', id: 'm2' },
    ]
    expect(withMirroredClickSync(navigation, false)).toEqual([
      { kind: 'transport', id: 'm1', metronomeSyncEnabled: false },
      { kind: 'preset', presetId: 'p1' },
      { kind: 'transport', id: 'm2', metronomeSyncEnabled: false },
    ])
    expect(withMirroredClickSync(navigation, true)[2]).toMatchObject({
      id: 'm2',
      metronomeSyncEnabled: true,
    })
  })
})
