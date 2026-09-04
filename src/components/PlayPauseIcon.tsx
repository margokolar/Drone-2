type PlayPauseIconProps = {
  size?: number
  className?: string
}

const PAUSE_BAR = { y: 3, width: 5, height: 18, rx: 1 } as const
/** Same gap as between Lucide pause bars (14 − 10). */
const BAR_GAP = 4

const PLAY_PATH =
  'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'

const VIEW_WIDTH = PAUSE_BAR.width * 2 + BAR_GAP * 2 + 16
const VIEW_HEIGHT = 24
const PLAY_X = PAUSE_BAR.width * 2 + BAR_GAP * 2

/** Pause bars + play triangle using Lucide proportions. */
export function PlayPauseIcon({ size = 28, className }: PlayPauseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x={0} y={PAUSE_BAR.y} width={PAUSE_BAR.width} height={PAUSE_BAR.height} rx={PAUSE_BAR.rx} />
      <rect
        x={PAUSE_BAR.width + BAR_GAP}
        y={PAUSE_BAR.y}
        width={PAUSE_BAR.width}
        height={PAUSE_BAR.height}
        rx={PAUSE_BAR.rx}
      />
      <g transform={`translate(${PLAY_X - 5}, 0)`}>
        <path d={PLAY_PATH} />
      </g>
    </svg>
  )
}
