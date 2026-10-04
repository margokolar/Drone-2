import clsx from 'clsx'

export type OvertoneControlVariant = 'portrait-solo' | 'portrait-steps' | 'landscape-inline'

export function overtoneControlButtonSizeClass(variant: OvertoneControlVariant): string {
  return variant === 'landscape-inline' ? 'h-10 px-2' : 'h-9 px-2.5'
}

export function overtoneIconButtonClass(variant: OvertoneControlVariant): string {
  return clsx(
    'button-safe flex shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40',
    variant === 'landscape-inline' ? 'size-10' : 'size-9',
  )
}

export function harmonicTimbreIconButtonClass(
  variant: 'portrait-solo' | 'landscape-inline',
  enabled: boolean,
): string {
  return clsx(
    overtoneIconButtonClass(variant),
    enabled
      ? 'border-cyan-200/90 bg-cyan-400/35 text-white shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:bg-cyan-400/45'
      : 'border-white/10 bg-white/3 text-white/35 hover:bg-white/8 hover:text-white/60',
  )
}
