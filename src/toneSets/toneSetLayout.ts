import { NOTE_IDS, type NoteId } from '../music/notes'

export const STORE_STORAGE_KEY = 'bourdon-store-v1'
export const TONE_SET_STORAGE_KEY = 'drone-tone-set-v1'
export const TONE_SET_COLLECTION_STORAGE_KEY = 'drone-tone-sets-v1'

export type ToneSetLayout = {
  name: string
  subOctaveIds: NoteId[]
  gridIds: NoteId[]
  toneLabelOverrides?: Partial<Record<NoteId, string>>
}

export type ToneSetCollection = {
  customSets: ToneSetLayout[]
}

export function buildDefaultToneSetLayout(): ToneSetLayout {
  return {
    name: 'Eesti Torupill',
    subOctaveIds: ['g0', 'a0'],
    gridIds: [
      'c',
      'd',
      'e',
      'f',
      'fis',
      'g',
      'a',
      'h',
      'c1',
      'd1',
      'e1',
      'f1',
      'fis1',
      'g1',
      'a1',
      'h1',
    ],
  }
}

export function isUniqueNoteIdList(values: NoteId[]): boolean {
  return new Set(values).size === values.length
}

export function parseToneIdList(values: unknown): {
  ids: NoteId[]
  labelOverrides: Partial<Record<NoteId, string>>
} {
  if (!Array.isArray(values)) {
    return { ids: [], labelOverrides: {} }
  }
  const NOTE_ID_ALIAS: Record<string, NoteId> = {
    'ab0': 'gis0',
    'a#0': 'b0',
    'bb0': 'b0',
    'cb1': 'h0',
    'b#0': 'c',
    'db': 'cis',
    'c#': 'cis',
    'eb': 'dis',
    'd#': 'dis',
    'gb': 'fis',
    'f#': 'fis',
    'ab': 'gis',
    'g#': 'gis',
    'a#': 'b',
    'bb': 'b',
    'cb2': 'h1',
    'b#1': 'c1',
    'db1': 'cis1',
    'c#1': 'cis1',
    'eb1': 'dis1',
    'd#1': 'dis1',
    'gb1': 'fis1',
    'f#1': 'fis1',
    'ab1': 'gis1',
    'g#1': 'gis1',
    'a#1': 'b1',
    'bb1': 'b1',
    'b#2': 'c2',
    'db2': 'cis2',
    'c#2': 'cis2',
  }
  const normalized: NoteId[] = []
  const labelOverrides: Partial<Record<NoteId, string>> = {}
  const formatAccidentalLabel = (token: string): string => {
    if (token.includes('b')) {
      return token.replace(/([a-z])b([0-9]?)/g, '$1♭$2')
    }
    if (token.includes('#')) {
      return token.replace(/([a-z])#([0-9]?)/g, '$1♯$2')
    }
    return token
  }
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const token = value.trim().toLowerCase().replace('♯', '#').replace('♭', 'b')
    const aliasResolved = NOTE_ID_ALIAS[token]
    const next = (aliasResolved ?? token) as NoteId
    if (NOTE_IDS.includes(next)) {
      normalized.push(next)
      if (token.includes('b') || token.includes('#')) {
        labelOverrides[next] = formatAccidentalLabel(token)
      }
    }
  }
  return { ids: normalized, labelOverrides }
}

export function isValidToneSetLayout(layout: ToneSetLayout): boolean {
  if (layout.subOctaveIds.length > 8 || layout.gridIds.length < 1 || layout.gridIds.length > NOTE_IDS.length) {
    return false
  }
  const merged = [...layout.subOctaveIds, ...layout.gridIds]
  if (merged.length < 1 || merged.length > NOTE_IDS.length) {
    return false
  }
  if (!isUniqueNoteIdList(merged) || merged.some((noteId) => !NOTE_IDS.includes(noteId))) {
    return false
  }
  return true
}

export function loadToneSetLayout(): ToneSetLayout {
  if (typeof window === 'undefined') {
    return buildDefaultToneSetLayout()
  }
  try {
    const raw = window.localStorage.getItem(TONE_SET_STORAGE_KEY)
    if (!raw) {
      return buildDefaultToneSetLayout()
    }
    const parsed = JSON.parse(raw) as Partial<ToneSetLayout>
    const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
    const parsedGrid = parseToneIdList(parsed.gridIds)
    const parsedOverrides =
      parsed.toneLabelOverrides && typeof parsed.toneLabelOverrides === 'object'
        ? (parsed.toneLabelOverrides as Partial<Record<NoteId, string>>)
        : {}
    const candidate: ToneSetLayout = {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
      subOctaveIds: parsedSubOctaves.ids,
      gridIds: parsedGrid.ids,
      toneLabelOverrides: {
        ...parsedOverrides,
        ...parsedSubOctaves.labelOverrides,
        ...parsedGrid.labelOverrides,
      },
    }
    if (!isValidToneSetLayout(candidate)) {
      return buildDefaultToneSetLayout()
    }
    return candidate
  } catch {
    return buildDefaultToneSetLayout()
  }
}

export function parseToneSetLayout(raw: unknown): ToneSetLayout | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const parsed = raw as Partial<ToneSetLayout>
  const parsedSubOctaves = parseToneIdList(parsed.subOctaveIds)
  const parsedGrid = parseToneIdList(parsed.gridIds)
  const parsedOverrides =
    parsed.toneLabelOverrides && typeof parsed.toneLabelOverrides === 'object'
      ? (parsed.toneLabelOverrides as Partial<Record<NoteId, string>>)
      : {}
  const candidate: ToneSetLayout = {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Custom',
    subOctaveIds: parsedSubOctaves.ids,
    gridIds: parsedGrid.ids,
    toneLabelOverrides: {
      ...parsedOverrides,
      ...parsedSubOctaves.labelOverrides,
      ...parsedGrid.labelOverrides,
    },
  }
  return isValidToneSetLayout(candidate) ? candidate : null
}

export function loadToneSetCollection(): ToneSetCollection {
  if (typeof window === 'undefined') {
    return { customSets: [] }
  }
  try {
    const rawCollection = window.localStorage.getItem(TONE_SET_COLLECTION_STORAGE_KEY)
    if (rawCollection) {
      const parsed = JSON.parse(rawCollection) as Partial<ToneSetCollection>
      const customSets = Array.isArray(parsed.customSets)
        ? parsed.customSets
            .map((entry) => parseToneSetLayout(entry))
            .filter((entry): entry is ToneSetLayout => Boolean(entry))
        : []
      return { customSets }
    }
    const legacyRaw = window.localStorage.getItem(TONE_SET_STORAGE_KEY)
    if (!legacyRaw) {
      return { customSets: [] }
    }
    const legacyParsed = JSON.parse(legacyRaw) as Partial<ToneSetLayout>
    const migrated = parseToneSetLayout(legacyParsed)
    if (!migrated) {
      return { customSets: [] }
    }
    if (migrated.name === buildDefaultToneSetLayout().name) {
      return { customSets: [] }
    }
    return { customSets: [migrated] }
  } catch {
    return { customSets: [] }
  }
}
