type PanFluteIconProps = {
  size?: number
  className?: string
}

/** Pan-pipe silhouette: varying tube heights suggest timbre partials. */
const PAN_FLUTE_PIPES = [
  { x: 2.5, height: 16 },
  { x: 6.1, height: 13.5 },
  { x: 9.7, height: 11.5 },
  { x: 13.3, height: 9.5 },
  { x: 16.9, height: 7.5 },
] as const

export function PanFluteIcon({ size = 18, className }: PanFluteIconProps) {
  const baseline = 20
  const pipeWidth = 2.4

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PAN_FLUTE_PIPES.map((pipe) => (
        <rect
          key={pipe.x}
          x={pipe.x}
          y={baseline - pipe.height}
          width={pipeWidth}
          height={pipe.height}
          rx={0.9}
        />
      ))}
    </svg>
  )
}
