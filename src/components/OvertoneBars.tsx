import { useRef, useState } from 'react'
import type { PartialConfig, TimbreBlend } from '../audio/types'
import { clamp, dbToGain, normalizedBlend } from '../audio/audioMath'

type OvertoneBarsProps = {
  partials: PartialConfig[]
  timbreBlend: TimbreBlend
  onGainChange: (partialId: string, gainDb: number) => void
  onToggleEnabled: (partialId: string, enabled: boolean) => void
  onGainDragStart?: () => void
}

const MIN_DB = -48
const MAX_DB = 0
const SOLO_LONG_PRESS_MS = 800

function toPercentFromDb(db: number): number {
  return ((clamp(db, MIN_DB, MAX_DB) - MIN_DB) / (MAX_DB - MIN_DB)) * 100
}

function toDbFromPercent(percent: number): number {
  return MIN_DB + (clamp(percent, 0, 100) / 100) * (MAX_DB - MIN_DB)
}

function gainToDb(gain: number): number {
  if (gain <= 0) {
    return MIN_DB
  }
  return 20 * Math.log10(gain)
}

function isNearlyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 0.001
}

type ComponentGains = {
  sine: number
  saw: number
  square: number
  total: number
}

function harmonicComponentContribution(
  targetRatio: number,
  sourceRatio: number,
  blend: TimbreBlend,
): Omit<ComponentGains, 'total'> {
  if (sourceRatio <= 0 || targetRatio <= 0) {
    return { sine: 0, saw: 0, square: 0 }
  }

  const harmonic = targetRatio / sourceRatio
  if (harmonic < 1 || !isNearlyInteger(harmonic)) {
    return { sine: 0, saw: 0, square: 0 }
  }

  const harmonicIndex = Math.round(harmonic)
  return {
    sine: harmonicIndex === 1 ? blend.sine : 0,
    saw: blend.saw / harmonicIndex,
    square: harmonicIndex % 2 === 1 ? blend.square / harmonicIndex : 0,
  }
}

function effectiveHarmonicComponents(
  targetRatio: number,
  sourcePartials: PartialConfig[],
  activePartialId: string | null,
  dragGainDb: number | null,
  blend: TimbreBlend,
): ComponentGains {
  const gains = sourcePartials.reduce<ComponentGains>((sum, source) => {
    if (!source.enabled) {
      return sum
    }
    const sourceGainDb = activePartialId === source.id && dragGainDb !== null ? dragGainDb : source.gainDb
    const sourceGain = dbToGain(sourceGainDb)
    const contribution = harmonicComponentContribution(targetRatio, source.ratio, blend)
    sum.sine += sourceGain * contribution.sine
    sum.saw += sourceGain * contribution.saw
    sum.square += sourceGain * contribution.square
    sum.total = sum.sine + sum.saw + sum.square
    return sum
  }, { sine: 0, saw: 0, square: 0, total: 0 })

  return gains
}

function logLayerPercents(components: ComponentGains): Omit<ComponentGains, 'total'> {
  const sine = toPercentFromDb(gainToDb(components.sine))
  const saw = toPercentFromDb(gainToDb(components.saw))
  const square = toPercentFromDb(gainToDb(components.square))
  const total = sine + saw + square

  if (total <= 0) {
    return { sine: 0, saw: 0, square: 0 }
  }

  return {
    sine: (sine / total) * 100,
    saw: (saw / total) * 100,
    square: (square / total) * 100,
  }
}

export function OvertoneBars({
  partials,
  timbreBlend,
  onGainChange,
  onToggleEnabled,
  onGainDragStart,
}: OvertoneBarsProps) {
  const [activePartialId, setActivePartialId] = useState<string | null>(null)
  const [dragGainDb, setDragGainDb] = useState<number | null>(null)
  const [soloPartialId, setSoloPartialId] = useState<string | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const pendingRef = useRef<{ partialId: string; gainDb: number } | null>(null)
  const soloRestoreRef = useRef<Map<string, boolean> | null>(null)
  const soloPressTimerRef = useRef<number | null>(null)
  const soloPressTriggeredRef = useRef(false)
  const blend = normalizedBlend(timbreBlend)

  const flushPending = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    const pending = pendingRef.current
    if (pending) {
      pendingRef.current = null
      onGainChange(pending.partialId, pending.gainDb)
    }
  }

  const updateByPointer = (partialId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const yFromTop = clamp(event.clientY - rect.top, 0, rect.height)
    const yFromBottom = rect.height - yFromTop
    const percent = (yFromBottom / rect.height) * 100
    const nextDb = toDbFromPercent(percent)
    setDragGainDb(nextDb)
    pendingRef.current = { partialId, gainDb: nextDb }
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const p = pendingRef.current
        if (p) {
          onGainChange(p.partialId, p.gainDb)
        }
      })
    }
  }

  const applyEnabledMap = (enabledById: Map<string, boolean>) => {
    partials.forEach((partial) => {
      const nextEnabled = enabledById.get(partial.id)
      if (typeof nextEnabled === 'boolean' && nextEnabled !== partial.enabled) {
        onToggleEnabled(partial.id, nextEnabled)
      }
    })
  }

  const restoreSoloState = () => {
    const restore = soloRestoreRef.current
    if (!restore) {
      return false
    }
    applyEnabledMap(restore)
    soloRestoreRef.current = null
    setSoloPartialId(null)
    return true
  }

  const enterSoloState = (partialId: string) => {
    const restoreState = new Map<string, boolean>()
    partials.forEach((partial) => {
      restoreState.set(partial.id, partial.enabled)
    })
    soloRestoreRef.current = restoreState
    const soloState = new Map<string, boolean>()
    partials.forEach((partial) => {
      soloState.set(partial.id, partial.id === partialId)
    })
    applyEnabledMap(soloState)
    setSoloPartialId(partialId)
  }

  const clearSoloPressTimer = () => {
    if (soloPressTimerRef.current !== null) {
      window.clearTimeout(soloPressTimerRef.current)
      soloPressTimerRef.current = null
    }
  }

  return (
    <div className="space-y-3">
      <div className="hide-scrollbar touch-pan-x overflow-x-auto">
        <div className="grid min-w-[620px] grid-cols-16 gap-1 landscape:min-w-0 landscape:w-full landscape:gap-0.5 max-h-[500px]:min-w-0 max-h-[500px]:w-full max-h-[500px]:gap-0.5">
          {partials.map((partial, index) => {
            const gainDbForHeight = activePartialId === partial.id && dragGainDb !== null ? dragGainDb : partial.gainDb
            const componentGains = effectiveHarmonicComponents(
              partial.ratio,
              partials,
              activePartialId,
              dragGainDb,
              blend,
            )
            const heightPercent = toPercentFromDb(gainDbForHeight)
            const totalEffectPercent = toPercentFromDb(gainToDb(componentGains.total))
            const layerPercents = logLayerPercents(componentGains)
            const isSoloMode = soloPartialId !== null
            const isSoloTarget = soloPartialId === partial.id
            const barClass = partial.enabled
              ? 'border-red-500/65 bg-black/40'
              : 'border-red-900/70 bg-black/25'
            const chipClass = isSoloTarget
              ? 'border-amber-300/70 bg-amber-300/25 text-amber-100'
              : partial.enabled
                ? 'border-white/10 bg-white/8 text-white/85'
                : 'border-white/5 bg-white/3 text-white/45'
            return (
              <div key={partial.id} className="space-y-1">
                <button
                  type="button"
                  className={`relative h-44 w-full touch-none rounded-md border landscape:h-28 max-h-[500px]:h-28 ${barClass}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    onGainDragStart?.()
                    setActivePartialId(partial.id)
                    setDragGainDb(partial.gainDb)
                    updateByPointer(partial.id, event)
                  }}
                  onPointerMove={(event) => {
                    if (activePartialId !== partial.id) {
                      return
                    }
                    event.preventDefault()
                    updateByPointer(partial.id, event)
                  }}
                  onPointerUp={(event) => {
                    if (activePartialId === partial.id) {
                      event.currentTarget.releasePointerCapture(event.pointerId)
                      flushPending()
                      setDragGainDb(null)
                    }
                    setActivePartialId(null)
                  }}
                  onPointerCancel={() => {
                    if (activePartialId === partial.id) {
                      flushPending()
                      setDragGainDb(null)
                    }
                    setActivePartialId(null)
                  }}
                  aria-label={`Overtone ${index + 1} gain`}
                >
                  <div
                    className="pointer-events-none absolute inset-x-1 bottom-0 rounded-t-sm border border-white/18 bg-white/7"
                    style={{ height: `${totalEffectPercent}%` }}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-b-md shadow-[0_0_18px_rgba(244,114,182,0.18)] transition-[height] duration-75"
                    style={{ height: `${heightPercent}%` }}
                  >
                    <div
                      className={partial.enabled ? 'bg-cyan-300/85' : 'bg-cyan-900/70'}
                      style={{ height: `${layerPercents.square}%` }}
                    />
                    <div
                      className={partial.enabled ? 'bg-fuchsia-400/90' : 'bg-fuchsia-950/75'}
                      style={{ height: `${layerPercents.saw}%` }}
                    />
                    <div
                      className={partial.enabled ? 'bg-amber-200/90' : 'bg-amber-950/75'}
                      style={{ height: `${layerPercents.sine}%` }}
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute left-0 right-0 h-0.5 bg-white/85 shadow-[0_0_10px_rgba(255,255,255,0.65)]"
                    style={{ bottom: `${totalEffectPercent}%` }}
                  />
                </button>
                <button
                  type="button"
                  className={`flex h-[35px] w-full min-w-0 items-center justify-center rounded border text-center text-xs tabular-nums landscape:h-7 max-h-[500px]:h-7 ${chipClass}`}
                  onPointerDown={() => {
                    soloPressTriggeredRef.current = false
                    clearSoloPressTimer()
                    soloPressTimerRef.current = window.setTimeout(() => {
                      soloPressTriggeredRef.current = true
                      if (!restoreSoloState()) {
                        enterSoloState(partial.id)
                      }
                    }, SOLO_LONG_PRESS_MS)
                  }}
                  onPointerUp={clearSoloPressTimer}
                  onPointerLeave={clearSoloPressTimer}
                  onPointerCancel={clearSoloPressTimer}
                  onClick={() => {
                    if (soloPressTriggeredRef.current) {
                      soloPressTriggeredRef.current = false
                      return
                    }
                    if (isSoloMode) {
                      restoreSoloState()
                      return
                    }
                    onToggleEnabled(partial.id, !partial.enabled)
                  }}
                  aria-label={`Toggle overtone ${index + 1}`}
                >
                  {index + 1}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
