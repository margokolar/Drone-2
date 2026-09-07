import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Midi, type MidiEndpoint } from '../native/midi'
import { applyScribbleSlot } from '../scribble/applyScribbleSlot'
import {
  buildScribbleSlotMap,
  resolveScribbleSlot,
  type ScribbleSlotEntry,
} from '../scribble/scribbleSlotMap'
import {
  buildDefaultPresetNavigation,
  type PresetNavigationEntry,
} from '../presets/presetNavigation'
import type { Preset } from '../presets/defaultPresets'
import { isIosApp } from '../utils/platform'

const STORAGE_KEY = 'drone-scribble-v1'

export type ScribbleSettings = {
  enabled: boolean
  followInput: boolean
  destinationId: number | null
  channel: number
}

function loadSettings(): ScribbleSettings {
  if (typeof localStorage === 'undefined') {
    return { enabled: false, followInput: true, destinationId: null, channel: 1 }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { enabled: false, followInput: true, destinationId: null, channel: 1 }
    }
    const parsed = JSON.parse(raw) as Partial<ScribbleSettings>
    return {
      enabled: parsed.enabled === true,
      followInput: parsed.followInput !== false,
      destinationId:
        typeof parsed.destinationId === 'number' ? parsed.destinationId : null,
      channel:
        typeof parsed.channel === 'number' && parsed.channel >= 1 && parsed.channel <= 16
          ? parsed.channel
          : 1,
    }
  } catch {
    return { enabled: false, followInput: true, destinationId: null, channel: 1 }
  }
}

function saveSettings(settings: ScribbleSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

type SongLibraryEntry = {
  name: string
  presets: Preset[]
  presetNavigation?: PresetNavigationEntry[]
  enabled?: boolean
}

type UseScribbleDisplayArgs = {
  songName: string
  activePresetId: string
  activeNavigationKey: string
  presets: Preset[]
  presetNavigation: PresetNavigationEntry[]
  songLibrary: SongLibraryEntry[]
}

function pickScribbleEndpoint(endpoints: MidiEndpoint[]): MidiEndpoint | null {
  const scribble = endpoints.find((item) => /scribble/i.test(item.name))
  return scribble ?? endpoints[0] ?? null
}

export function useScribbleDisplay({
  songName,
  activePresetId,
  activeNavigationKey,
  presets,
  presetNavigation,
  songLibrary,
}: UseScribbleDisplayArgs) {
  const [settings, setSettingsState] = useState<ScribbleSettings>(loadSettings)
  const [destinations, setDestinations] = useState<MidiEndpoint[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)
  const [lastSentSlot, setLastSentSlot] = useState<number | null>(null)
  const lastSentRef = useRef<number | null>(null)
  const lastMidiSourceIdRef = useRef<number | null>(null)
  const suppressOutgoingRef = useRef(false)
  const suppressIncomingRef = useRef(false)
  const slotMapRef = useRef<ScribbleSlotEntry[]>([])

  const activePresetName =
    presets.find((preset) => preset.id === activePresetId)?.name ?? ''

  const slotMap: ScribbleSlotEntry[] = useMemo(() => {
    const songs = songLibrary
      .filter((song) => song.enabled !== false)
      .map((song) =>
        song.name === songName
          ? { ...song, presets, presetNavigation }
          : {
              ...song,
              presetNavigation:
                song.presetNavigation ?? buildDefaultPresetNavigation(song.presets),
            },
      )
    return buildScribbleSlotMap(songs)
  }, [presetNavigation, presets, songLibrary, songName])

  slotMapRef.current = slotMap

  const currentSlot = useMemo(
    () =>
      resolveScribbleSlot(
        slotMap,
        songName,
        activePresetId,
        activePresetName,
        activeNavigationKey,
      ),
    [activeNavigationKey, activePresetId, activePresetName, slotMap, songName],
  )

  const setSettings = useCallback((patch: Partial<ScribbleSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const refreshDestinations = useCallback(async () => {
    if (!isIosApp()) {
      return
    }
    try {
      const [destResult, sourceResult] = await Promise.all([
        Midi.listDestinations(),
        Midi.listSources(),
      ])
      setDestinations(destResult.destinations)
      setAccessError(null)

      const scribbleSource = sourceResult.sources.find((item) => /scribble/i.test(item.name))
      if (scribbleSource) {
        lastMidiSourceIdRef.current = scribbleSource.id
      }

      setSettingsState((current) => {
        if (scribbleSource) {
          void Midi.findDestinationForSource({ sourceId: scribbleSource.id })
            .then((paired) => {
              setSettingsState((inner) => {
                const next = { ...inner, destinationId: paired.destinationId }
                saveSettings(next)
                return next
              })
            })
            .catch(() => {
              const picked = pickScribbleEndpoint(destResult.destinations)
              if (!picked) {
                return
              }
              setSettingsState((inner) => {
                if (inner.destinationId === picked.id) {
                  return inner
                }
                const next = { ...inner, destinationId: picked.id }
                saveSettings(next)
                return next
              })
            })
          return current
        }

        if (current.destinationId !== null) {
          const stillExists = destResult.destinations.some(
            (item) => item.id === current.destinationId,
          )
          if (stillExists) {
            return current
          }
        }
        const picked = pickScribbleEndpoint(destResult.destinations)
        if (!picked) {
          return current
        }
        const next = { ...current, destinationId: picked.id }
        saveSettings(next)
        return next
      })
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'MIDI unavailable')
    }
  }, [])

  const showBluetoothPicker = useCallback(async () => {
    if (!isIosApp()) {
      return
    }
    try {
      await Midi.showBluetoothMidiPicker()
      window.setTimeout(() => {
        void refreshDestinations()
      }, 800)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Bluetooth MIDI picker failed')
    }
  }, [refreshDestinations])

  useEffect(() => {
    if (!isIosApp()) {
      return
    }
    void refreshDestinations()
  }, [refreshDestinations])

  useEffect(() => {
    if (!isIosApp() || !settings.enabled || !settings.followInput) {
      return
    }

    let listenerHandle: { remove: () => Promise<void> } | null = null
    let cancelled = false

    void (async () => {
      try {
        await Midi.startListening()
        await refreshDestinations()
        if (cancelled) {
          return
        }
        listenerHandle = await Midi.addListener('midiMessage', (event) => {
          if (event.type !== 'programChange') {
            return
          }
          if (event.channel !== settings.channel) {
            return
          }
          if (suppressIncomingRef.current) {
            return
          }
          if (typeof event.sourceId === 'number' && event.sourceId > 0) {
            lastMidiSourceIdRef.current = event.sourceId
          }
          suppressOutgoingRef.current = true
          lastSentRef.current = event.program
          setLastSentSlot(event.program)
          applyScribbleSlot(event.program, slotMapRef.current)
          window.setTimeout(() => {
            suppressOutgoingRef.current = false
          }, 150)
        })
      } catch (error) {
        if (!cancelled) {
          setAccessError(error instanceof Error ? error.message : 'MIDI listen failed')
        }
      }
    })()

    return () => {
      cancelled = true
      void listenerHandle?.remove()
      void Midi.stopListening()
    }
  }, [refreshDestinations, settings.channel, settings.enabled, settings.followInput])

  useEffect(() => {
    if (!isIosApp() || !settings.enabled) {
      return
    }
    if (suppressOutgoingRef.current) {
      return
    }
    if (currentSlot === null) {
      return
    }
    if (lastSentRef.current === currentSlot) {
      return
    }

    suppressIncomingRef.current = true
    void Midi.sendProgramChangeToScribble({
      program: currentSlot,
      channel: settings.channel,
      sourceId: lastMidiSourceIdRef.current ?? undefined,
    })
      .then((result) => {
        lastSentRef.current = currentSlot
        setLastSentSlot(currentSlot)
        setAccessError(null)
        if (result.destinationId !== settings.destinationId) {
          setSettings({ destinationId: result.destinationId })
        }
      })
      .catch((error) => {
        setAccessError(error instanceof Error ? error.message : 'Failed to send MIDI')
      })
      .finally(() => {
        window.setTimeout(() => {
          suppressIncomingRef.current = false
        }, 150)
      })
  }, [activeNavigationKey, activePresetId, currentSlot, settings.channel, settings.destinationId, settings.enabled, setSettings])

  return {
    supported: isIosApp(),
    settings,
    setEnabled: (enabled: boolean) => {
      setSettings({ enabled })
      if (enabled) {
        void refreshDestinations()
      }
    },
    setFollowInput: (followInput: boolean) => setSettings({ followInput }),
    setDestinationId: (destinationId: number | null) => setSettings({ destinationId }),
    setChannel: (channel: number) =>
      setSettings({ channel: Math.min(16, Math.max(1, Math.round(channel))) }),
    destinations,
    refreshDestinations,
    showBluetoothPicker,
    accessError,
    slotMap,
    currentSlot,
    lastSentSlot,
  }
}
