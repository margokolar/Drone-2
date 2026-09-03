import type { Preset } from './defaultPresets'

export type PresetTransportMarker = {
  kind: 'transport'
  id: string
  /** When false, prev/next navigation skips this marker. Defaults to true. */
  enabled?: boolean
}

export type PresetNavigationEntry =
  | { kind: 'preset'; presetId: string }
  | PresetTransportMarker

export function isNavigationEnabled(item: { enabled?: boolean }): boolean {
  return item.enabled !== false
}

export function navigationEntryKey(entry: PresetNavigationEntry): string {
  return entry.kind === 'preset' ? entry.presetId : entry.id
}

export function buildDefaultPresetNavigation(presets: Preset[]): PresetNavigationEntry[] {
  return presets.map((preset) => ({ kind: 'preset', presetId: preset.id }))
}

export function normalizePresetNavigation(
  navigation: PresetNavigationEntry[] | undefined,
  presets: Preset[],
): PresetNavigationEntry[] {
  if (presets.length === 0) {
    return []
  }
  const presetIds = new Set(presets.map((preset) => preset.id))
  const normalized: PresetNavigationEntry[] = []
  const seenPresetIds = new Set<string>()

  for (const entry of navigation ?? []) {
    if (entry.kind === 'transport') {
      normalized.push({ ...entry, enabled: isNavigationEnabled(entry) })
      continue
    }
    if (!presetIds.has(entry.presetId) || seenPresetIds.has(entry.presetId)) {
      continue
    }
    seenPresetIds.add(entry.presetId)
    normalized.push(entry)
  }

  for (const preset of presets) {
    if (!seenPresetIds.has(preset.id)) {
      normalized.push({ kind: 'preset', presetId: preset.id })
    }
  }

  return normalized
}

export function getEnabledNavigationEntries(
  navigation: PresetNavigationEntry[],
  presets: Preset[],
): PresetNavigationEntry[] {
  return navigation.filter((entry) => {
    if (entry.kind === 'transport') {
      return isNavigationEnabled(entry)
    }
    const preset = presets.find((item) => item.id === entry.presetId)
    return preset !== undefined && isNavigationEnabled(preset)
  })
}

export function selectNextInRing<T>(
  items: T[],
  activeKey: string,
  getKey: (item: T) => string,
): T | undefined {
  if (items.length <= 1) {
    return undefined
  }
  const index = items.findIndex((item) => getKey(item) === activeKey)
  const nextIndex = index >= 0 ? (index + 1) % items.length : 0
  return items[nextIndex]
}

export function selectPreviousInRing<T>(
  items: T[],
  activeKey: string,
  getKey: (item: T) => string,
): T | undefined {
  if (items.length <= 1) {
    return undefined
  }
  const index = items.findIndex((item) => getKey(item) === activeKey)
  const nextIndex = index >= 0 ? (index - 1 + items.length) % items.length : 0
  return items[nextIndex]
}

export function createTransportMarkerId(): string {
  return `transport-${Date.now()}`
}

export type PresetNavigationPickerItem = {
  id: string
  name: string
  kind: 'preset' | 'transport'
  navigationEnabled: boolean
}

export function buildPresetNavigationPickerItems(
  navigation: PresetNavigationEntry[],
  presets: Preset[],
): PresetNavigationPickerItem[] {
  const items: PresetNavigationPickerItem[] = []
  for (const entry of navigation) {
    if (entry.kind === 'transport') {
      items.push({
        id: entry.id,
        name: 'Play / Pause',
        kind: 'transport',
        navigationEnabled: isNavigationEnabled(entry),
      })
      continue
    }
    const preset = presets.find((item) => item.id === entry.presetId)
    if (!preset) {
      continue
    }
    items.push({
      id: preset.id,
      name: preset.name,
      kind: 'preset',
      navigationEnabled: isNavigationEnabled(preset),
    })
  }
  return items
}

export function isTransportMarkerKey(
  key: string,
  navigation: PresetNavigationEntry[],
): boolean {
  return navigation.some((entry) => entry.kind === 'transport' && entry.id === key)
}

/** Preset card highlight: falls back to activePresetId when nav key is a disabled/missing marker. */
export function resolveActivePresetHighlightKey(
  activeNavigationKey: string,
  activePresetId: string,
  navigation: PresetNavigationEntry[],
): string {
  const activeEntry = navigation.find((entry) => navigationEntryKey(entry) === activeNavigationKey)
  if (activeEntry?.kind === 'transport') {
    return isNavigationEnabled(activeEntry) ? '' : activePresetId
  }
  if (activeEntry?.kind === 'preset') {
    return activeEntry.presetId
  }
  return activePresetId
}

/** First enabled preset in navigation order (ignores transport markers). */
export function resolveFirstEnabledPresetInNavigation(
  navigation: PresetNavigationEntry[],
  presets: Preset[],
): Preset | null {
  for (const entry of navigation) {
    if (entry.kind === 'transport') {
      continue
    }
    const preset = presets.find((item) => item.id === entry.presetId)
    if (preset && isNavigationEnabled(preset)) {
      return preset
    }
  }
  return presets.find((preset) => isNavigationEnabled(preset)) ?? presets[0] ?? null
}

/** First enabled navigation entry in list order (presets and transport markers). */
export function resolveFirstActiveNavigationTarget(
  navigation: PresetNavigationEntry[],
  presets: Preset[],
): { navigationKey: string; preset: Preset } | null {
  const firstPreset = resolveFirstEnabledPresetInNavigation(navigation, presets)
  if (!firstPreset) {
    return null
  }

  for (const entry of navigation) {
    if (entry.kind === 'transport') {
      if (isNavigationEnabled(entry)) {
        return { navigationKey: entry.id, preset: firstPreset }
      }
      continue
    }
    const preset = presets.find((item) => item.id === entry.presetId)
    if (preset && isNavigationEnabled(preset)) {
      return { navigationKey: entry.presetId, preset }
    }
  }

  return { navigationKey: firstPreset.id, preset: firstPreset }
}

/** Last enabled preset listed before a transport marker. */
export function resolvePresetBeforeMarker(
  navigation: PresetNavigationEntry[],
  presets: Preset[],
  markerId: string,
): Preset | null {
  let previous: Preset | null = null
  for (const entry of navigation) {
    if (entry.kind === 'transport') {
      if (entry.id === markerId) {
        return previous
      }
      continue
    }
    const preset = presets.find((item) => item.id === entry.presetId)
    if (preset && isNavigationEnabled(preset)) {
      previous = preset
    }
  }
  return null
}
