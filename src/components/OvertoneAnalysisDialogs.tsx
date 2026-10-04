import { X } from 'lucide-react'

export type OvertoneAnalysisApplyMode = 'gain-ratios' | 'gain-integer-ratios'

/** Asks how an analysed audio file should be applied to the overtone bars. */
export function OvertoneAnalysisApplyDialog({
  onApply,
  onDismiss,
}: {
  onApply: (mode: OvertoneAnalysisApplyMode) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overtone-analysis-dialog-title"
        className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="overtone-analysis-dialog-title" className="text-sm font-semibold text-white">
              Apply analysis
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Sample waveform is applied as a wavetable. Choose how overtone bars get ratios.
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
            onClick={onDismiss}
            aria-label="Dismiss analysis"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="button-safe min-h-[44px] rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-300/25"
            onClick={() => onApply('gain-integer-ratios')}
          >
            Gain + integer ratios (1, 2, 3…)
          </button>
          <button
            type="button"
            className="button-safe min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={() => onApply('gain-ratios')}
          >
            Gain + measured ratios
          </button>
        </div>
      </div>
    </div>
  )
}

export function OvertoneAnalysisErrorDialog({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overtone-analysis-error-title"
        className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
      >
        <h2 id="overtone-analysis-error-title" className="text-sm font-semibold text-white">
          Analysis failed
        </h2>
        <p className="mt-2 text-sm text-white/70">{message}</p>
        <button
          type="button"
          className="button-safe mt-4 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          onClick={onDismiss}
        >
          OK
        </button>
      </div>
    </div>
  )
}
