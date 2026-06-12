import { useEffect, useState } from 'react'
import { droneEngine } from '../audio/DroneEngine'
import { useDroneStore } from '../store/useDroneStore'
import { getBleDebugEvents, subscribeBleDebug } from '../utils/bleDebug'

type Props = {
  getAnchorPaused: () => boolean | null
}

/** Temporary on-screen diagnostics for the BlueTurn / Media Session issue. */
export function BleDebugOverlay({ getAnchorPaused }: Props) {
  const [, forceRender] = useState(0)
  const playing = useDroneStore((state) => state.playing)

  useEffect(() => {
    const unsubscribe = subscribeBleDebug(() => forceRender((value) => value + 1))
    const intervalId = window.setInterval(() => forceRender((value) => value + 1), 500)
    return () => {
      unsubscribe()
      window.clearInterval(intervalId)
    }
  }, [])

  const playbackState =
    'mediaSession' in navigator ? navigator.mediaSession.playbackState : 'n/a'
  const anchorPaused = getAnchorPaused()
  const contextLabel = droneEngine.contextDebugLabel()
  const now = Date.now()
  const events = getBleDebugEvents()

  return (
    <div
      className="fixed inset-x-1 bottom-1 z-[60] rounded-lg border border-white/20 bg-black/85 p-2 font-mono text-[10px] leading-tight text-emerald-300"
      style={{ pointerEvents: 'none' }}
    >
      <div className="text-white">
        playing={String(playing)} · playbackState={playbackState} · anchorPaused=
        {String(anchorPaused)} · ctx={contextLabel}
      </div>
      <div className="mt-1 max-h-32 overflow-hidden">
        {events.length === 0 ? (
          <div className="text-white/50">no pedal events yet…</div>
        ) : (
          events.map((event) => (
            <div key={event.t}>
              -{Math.round((now - event.t) / 100) / 10}s [{event.source}] {event.label}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
