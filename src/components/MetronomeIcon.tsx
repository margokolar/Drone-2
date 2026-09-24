import type { SVGProps } from 'react'

type MetronomeIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

/** Trapezoid metronome body with a swinging pendulum. */
export function MetronomeIcon({ size = 24, className, ...props }: MetronomeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M10.5 3h3L20 21H4Z" />
      <path d="M11 17 19.5 3.2" />
    </svg>
  )
}
