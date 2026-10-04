import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartialConfig } from '../audio/types'
import {
  OVERTONE_MIDI_MAX_PARTIALS,
  cc7ToEnabled,
  cc7ToGainDb,
  enableCcForIndex,
  enabledToCc7,
  gainCcForIndex,
  gainDbToCc7,
} from '../midi/overtoneMidi'

const STORAGE_KEY = 'drone-overtone-midi-v1'

export type MidiSettings = {
  enabled: boolean
  channel: number
  inputId: string
  outputId: string
}

function loadSettings(): MidiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { enabled: false, channel: 1, inputId: '', outputId: '' }
    }
    const parsed = JSON.parse(raw) as Partial<MidiSettings>
    return {
      enabled: Boolean(parsed.enabled),
      channel: Math.max(1, Math.min(16, Number(parsed.channel) || 1)),
      inputId: typeof parsed.inputId === 'string' ? parsed.inputId : '',
      outputId: typeof parsed.outputId === 'string' ? parsed.outputId : '',
    }
  } catch {
    return { enabled: false, channel: 1, inputId: '', outputId: '' }
  }
}

function saveSettings(s: MidiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function hasWebMidi(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}

type UseOvertoneMidiArgs = {
  partials: PartialConfig[]
  setPartialGain: (partialId: string, gainDb: number) => void
  setPartialEnabled: (partialId: string, enabled: boolean) => void
}

export function useOvertoneMidi({ partials, setPartialGain, setPartialEnabled }: UseOvertoneMidiArgs) {
  const [settings, setSettings] = useState<MidiSettings>(loadSettings)
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [portTick, setPortTick] = useState(0)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessRetry, setAccessRetry] = useState(0)

  const outputRef = useRef<MIDIOutput | null>(null)
  const inputsRef = useRef<MIDIInput[]>([])
  const suppressOutRef = useRef(false)
  const echoBlockRef = useRef<Map<number, { value: number; t: number }>>(new Map())
  const midiPortListenRef = useRef<{ access: MIDIAccess; onPortChange: () => void } | null>(null)

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, enabled }
      saveSettings(next)
      return next
    })
  }, [])

  const setChannel = useCallback((channel: number) => {
    setSettings((prev) => {
      const next = { ...prev, channel: Math.max(1, Math.min(16, channel)) }
      saveSettings(next)
      return next
    })
  }, [])

  const setInputId = useCallback((inputId: string) => {
    setSettings((prev) => {
      const next = { ...prev, inputId }
      saveSettings(next)
      return next
    })
  }, [])

  const setOutputId = useCallback((outputId: string) => {
    setSettings((prev) => {
      const next = { ...prev, outputId }
      saveSettings(next)
      return next
    })
  }, [])

  const retryMidiAccess = useCallback(() => {
    setAccessError(null)
    setAccessRetry((n) => n + 1)
  }, [])

  const channelIndex0 = settings.channel - 1

  const updateOutputRef = useCallback(
    (access: MIDIAccess | null) => {
      outputRef.current = null
      if (!access || !settings.outputId) {
        return
      }
      const output = access.outputs.get(settings.outputId)
      if (output) {
        outputRef.current = output
      }
    },
    [settings.outputId],
  )

  const sendRawCc = useCallback(
    (cc: number, value7: number) => {
      const out = outputRef.current
      if (!out || !settings.enabled) {
        return
      }
      const v = Math.max(0, Math.min(127, Math.round(value7)))
      const status = 0xb0 | channelIndex0
      out.send([status, cc, v])
      echoBlockRef.current.set(cc, { value: v, t: performance.now() })
    },
    [channelIndex0, settings.enabled],
  )

  const indexForPartialId = useCallback(
    (partialId: string) => {
      const i = partials.findIndex((p) => p.id === partialId)
      if (i < 0 || i >= OVERTONE_MIDI_MAX_PARTIALS) {
        return -1
      }
      return i
    },
    [partials],
  )

  const applyIncomingCc = useCallback(
    (cc: number, value7: number) => {
      const now = performance.now()
      const echo = echoBlockRef.current.get(cc)
      if (echo && now - echo.t < 24 && Math.abs(echo.value - value7) <= 1) {
        echoBlockRef.current.delete(cc)
        return
      }

      for (let i = 0; i < OVERTONE_MIDI_MAX_PARTIALS; i += 1) {
        const g = gainCcForIndex(i)
        if (g === cc) {
          const id = partials[i]?.id
          if (!id) {
            return
          }
          const db = cc7ToGainDb(value7)
          suppressOutRef.current = true
          setPartialGain(id, db)
          queueMicrotask(() => {
            suppressOutRef.current = false
          })
          return
        }
      }
      for (let i = 0; i < OVERTONE_MIDI_MAX_PARTIALS; i += 1) {
        const e = enableCcForIndex(i)
        if (e === cc) {
          const id = partials[i]?.id
          if (!id) {
            return
          }
          const on = cc7ToEnabled(value7)
          suppressOutRef.current = true
          setPartialEnabled(id, on)
          queueMicrotask(() => {
            suppressOutRef.current = false
          })
          return
        }
      }
    },
    [partials, setPartialEnabled, setPartialGain],
  )

  const onPartialGainFromUi = useCallback(
    (partialId: string, gainDb: number) => {
      setPartialGain(partialId, gainDb)
      if (suppressOutRef.current || !settings.enabled) {
        return
      }
      const idx = indexForPartialId(partialId)
      if (idx < 0) {
        return
      }
      const cc = gainCcForIndex(idx)
      if (cc === null) {
        return
      }
      sendRawCc(cc, gainDbToCc7(gainDb))
    },
    [indexForPartialId, sendRawCc, setPartialGain, settings.enabled],
  )

  const onPartialEnabledFromUi = useCallback(
    (partialId: string, enabled: boolean) => {
      setPartialEnabled(partialId, enabled)
      if (suppressOutRef.current || !settings.enabled) {
        return
      }
      const idx = indexForPartialId(partialId)
      if (idx < 0) {
        return
      }
      const cc = enableCcForIndex(idx)
      if (cc === null) {
        return
      }
      sendRawCc(cc, enabledToCc7(enabled))
    },
    [indexForPartialId, sendRawCc, setPartialEnabled, settings.enabled],
  )

  const sendSnapshot = useCallback(() => {
    if (!settings.enabled) {
      return
    }
    const n = Math.min(partials.length, OVERTONE_MIDI_MAX_PARTIALS)
    for (let i = 0; i < n; i += 1) {
      const p = partials[i]
      const gcc = gainCcForIndex(i)
      const ecc = enableCcForIndex(i)
      if (gcc !== null) {
        sendRawCc(gcc, gainDbToCc7(p.gainDb))
      }
      if (ecc !== null) {
        sendRawCc(ecc, enabledToCc7(p.enabled))
      }
    }
  }, [partials, sendRawCc, settings.enabled])

  useEffect(() => {
    updateOutputRef(midiAccess)
  }, [midiAccess, updateOutputRef, portTick])

  useEffect(() => {
    if (!settings.enabled) {
      // Releases the browser MIDI handle acquired asynchronously below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMidiAccess(null)
      return
    }
    if (!hasWebMidi()) {
      return
    }
    let cancelled = false
    const onPortChange = () => setPortTick((t) => t + 1)

    setAccessError(null)
    navigator.requestMIDIAccess({ sysex: false }).then(
      (access) => {
        if (cancelled) {
          return
        }
        midiPortListenRef.current = { access, onPortChange }
        access.addEventListener('statechange', onPortChange)
        setMidiAccess(access)
      },
      (err: unknown) => {
        if (cancelled) {
          return
        }
        setAccessError(err instanceof Error ? err.message : 'MIDI access denied')
        setMidiAccess(null)
      },
    )
    return () => {
      cancelled = true
      const bundle = midiPortListenRef.current
      if (bundle) {
        bundle.access.removeEventListener('statechange', bundle.onPortChange)
        midiPortListenRef.current = null
      }
    }
  }, [settings.enabled, accessRetry])

  useEffect(() => {
    if (!midiAccess) {
      inputsRef.current.forEach((input) => {
        input.onmidimessage = null
      })
      inputsRef.current = []
      return
    }

    const onMessage = (event: MIDIMessageEvent) => {
      const data = event.data
      if (!data || data.length < 3) {
        return
      }
      const status = data[0]
      const ch = (status & 0x0f) === channelIndex0
      if (!ch) {
        return
      }
      if ((status & 0xf0) !== 0xb0) {
        return
      }
      const cc = data[1]
      const v = data[2]
      if (cc === undefined || v === undefined) {
        return
      }
      applyIncomingCc(cc, v)
    }

    inputsRef.current.forEach((input) => {
      input.onmidimessage = null
    })
    inputsRef.current = []

    if (!settings.inputId) {
      return
    }

    const input = midiAccess.inputs.get(settings.inputId)
    if (!input) {
      return
    }
    input.onmidimessage = onMessage
    inputsRef.current = [input]

    return () => {
      input.onmidimessage = null
    }
  }, [applyIncomingCc, channelIndex0, midiAccess, settings.inputId, portTick])

  const inputOptions = midiAccess
    ? Array.from(midiAccess.inputs.values()).map((i) => ({ id: i.id, name: i.name || i.id }))
    : []
  const outputOptions = midiAccess
    ? Array.from(midiAccess.outputs.values()).map((o) => ({ id: o.id, name: o.name || o.id }))
    : []

  return {
    webMidiSupported: hasWebMidi(),
    accessError,
    settings,
    setEnabled,
    setChannel,
    setInputId,
    setOutputId,
    retryMidiAccess,
    sendSnapshot,
    inputOptions,
    outputOptions,
    onPartialGainFromUi,
    onPartialEnabledFromUi,
  }
}
