import { useEffect, useState } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import { getBleDebugEvents, subscribeBleDebug } from '../utils/bleDebug'

type Props = {
  getAnchorPaused: () => boolean | null
}

function formatClock(t: number): string {
  const d = new Date(t)
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(
    d.getMilliseconds(),
  ).padStart(3, '0')}`
}

/** On-screen diagnostics for BlueTurn / Media Session (?debug=1 only). */
export function BleDebugOverlay({ getAnchorPaused }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [, forceRender] = useState(0)
  const playing = useDroneStore((state) => state.playing)

  useEffect(() => {
    const unsubscribe = subscribeBleDebug(() => forceRender((value) => value + 1))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!expanded) {
      return
    }
    const intervalId = window.setInterval(() => forceRender((value) => value + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [expanded])

  const playbackState =
    'mediaSession' in navigator ? navigator.mediaSession.playbackState : 'n/a'
  const contextLabel = droneEngine.contextDebugLabel()
  const events = getBleDebugEvents()
  const statusLine = `playing=${String(playing)} · ctx=${contextLabel} · anchor=${String(getAnchorPaused())}`

  return (
    <div
      className="fixed inset-x-2 top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-[60] max-w-md font-mono text-[10px] leading-tight text-emerald-300"
      style={{ pointerEvents: 'auto' }}
    >
      <button
        type="button"
        className="w-full rounded-lg border border-white/20 bg-black/85 px-2 py-1 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="truncate text-white">
          BLE {expanded ? '▼' : '▶'} · {statusLine}
        </div>
        {expanded ? (
          <>
            <div className="mt-0.5 text-white/70">
              playbackState={playbackState}
            </div>
            <div className="mt-1 max-h-28 overflow-y-auto overscroll-contain">
              {events.length === 0 ? (
                <div className="text-white/50">no pedal events yet…</div>
              ) : (
                events.map((event) => (
                  <div key={event.seq}>
                    #{event.seq} {formatClock(event.t)} [{event.source}] {event.label}
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </button>
    </div>
  )
}
