import { Mic, MicOff } from 'lucide-react'
import {
  ADD_HARMONIC_COLUMNS,
  DEFAULT_ADD_GATE_THRESHOLD,
  DEFAULT_ADD_INPUT_GAIN_DB,
  MAX_ADD_GATE_THRESHOLD,
  MAX_ADD_INPUT_GAIN_DB,
  MAX_ADD_OUTPUT_GAIN_DB,
  MIN_ADD_GATE_THRESHOLD,
  MIN_ADD_INPUT_GAIN_DB,
  MIN_ADD_OUTPUT_GAIN_DB,
  type AddFollowerState,
} from '../hooks/useAddFollower'
import { DEFAULT_ADD_OUTPUT_GAIN_DB } from '../audio/AddEngine'
import { ResettableRangeInput } from './ResettableRangeInput'
import { SectionCard } from './SectionCard'

type AddFollowerControlsProps = AddFollowerState

function formatHz(hz: number | null): string {
  if (hz === null) {
    return '—'
  }
  if (hz >= 100) {
    return `${hz.toFixed(1)} Hz`
  }
  return `${hz.toFixed(2)} Hz`
}

function formatGateThreshold(threshold: number): string {
  return `${(threshold * 100).toFixed(1)}%`
}

type HarmonicOptionButtonProps = {
  option: {
    ratio: number
    label: string
  }
  harmonicRatio: number
  setHarmonicRatio: (ratio: number) => void
}

function HarmonicOptionButton({
  option,
  harmonicRatio,
  setHarmonicRatio,
}: HarmonicOptionButtonProps) {
  return (
    <button
      type="button"
      className={`button-safe w-full rounded-lg border px-1.5 py-1.5 text-xs tabular-nums transition ${
        harmonicRatio === option.ratio
          ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-50'
          : 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
      }`}
      onClick={() => setHarmonicRatio(option.ratio)}
      aria-pressed={harmonicRatio === option.ratio}
      aria-label={
        option.ratio < 1 ? `Subharmonic ${option.label}` : `Harmonic ${option.label}`
      }
    >
      {option.label}
    </button>
  )
}

type AddMicToolbarButtonProps = {
  listening: boolean
  startListening: () => void
  stopListening: () => void
}

export function AddMicToolbarButton({
  listening,
  startListening,
  stopListening,
}: AddMicToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`button-safe flex min-h-[44px] items-center justify-center rounded-xl border px-2 py-3 transition ${
        listening
          ? 'border-cyan-300/80 bg-cyan-300/25 text-cyan-50 hover:bg-cyan-300/35'
          : 'border-cyan-300/50 bg-cyan-400/15 text-white hover:bg-cyan-300/25'
      }`}
      onClick={() => {
        if (listening) {
          stopListening()
          return
        }
        void startListening()
      }}
      aria-label={listening ? 'Stop ADD microphone' : 'Start ADD microphone'}
      aria-pressed={listening}
    >
      {listening ? <MicOff size={22} /> : <Mic size={22} />}
    </button>
  )
}

export function AddFollowerControls({
  harmonicRatio,
  inputGainDb,
  outputGainDb,
  gateThresholdRms,
  detectedHz,
  outputHz,
  micError,
  setHarmonicRatio,
  setInputGainDb,
  setOutputGainDb,
  setGateThresholdRms,
}: AddFollowerControlsProps) {
  return (
    <SectionCard title="ADD — acoustic drone">
      <div className="space-y-4">
        <p className="text-sm text-white/65">
          Independent voice — listens via microphone and follows pitch at a harmonic-series partial
          above or below the heard tone. Does not use the tone set or main drone engine. Use headphones
          to avoid feedback.
        </p>

        {micError ? (
          <p className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
            {micError}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-white/60">Input gain</span>
              <span className="text-xs tabular-nums text-white/70">{inputGainDb.toFixed(1)} dB</span>
            </div>
            <ResettableRangeInput
              min={MIN_ADD_INPUT_GAIN_DB}
              max={MAX_ADD_INPUT_GAIN_DB}
              step={0.5}
              value={inputGainDb}
              onChange={(event) => setInputGainDb(Number(event.target.value))}
              onReset={() => setInputGainDb(DEFAULT_ADD_INPUT_GAIN_DB)}
              aria-label="ADD input gain. Double-click or double-tap to reset to default."
              className="h-1.5 w-full accent-cyan-300"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-white/60">Output gain</span>
              <span className="text-xs tabular-nums text-white/70">{outputGainDb.toFixed(1)} dB</span>
            </div>
            <ResettableRangeInput
              min={MIN_ADD_OUTPUT_GAIN_DB}
              max={MAX_ADD_OUTPUT_GAIN_DB}
              step={0.5}
              value={outputGainDb}
              onChange={(event) => setOutputGainDb(Number(event.target.value))}
              onReset={() => setOutputGainDb(DEFAULT_ADD_OUTPUT_GAIN_DB)}
              aria-label="ADD output gain. Double-click or double-tap to reset to default."
              className="h-1.5 w-full accent-cyan-300"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.16em] text-white/60">Gate</span>
            <span className="text-xs tabular-nums text-white/70">
              {formatGateThreshold(gateThresholdRms)}
            </span>
          </div>
          <ResettableRangeInput
            min={MIN_ADD_GATE_THRESHOLD}
            max={MAX_ADD_GATE_THRESHOLD}
            step={0.001}
            value={gateThresholdRms}
            onChange={(event) => setGateThresholdRms(Number(event.target.value))}
            onReset={() => setGateThresholdRms(DEFAULT_ADD_GATE_THRESHOLD)}
            aria-label="ADD gate threshold. Double-click or double-tap to reset to default."
            className="h-1.5 w-full accent-cyan-300"
          />
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/60">Harmonic</div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[17.5rem] grid-cols-8 gap-1.5">
              {ADD_HARMONIC_COLUMNS.map((column) => (
                <div key={column.harmonic} className="flex min-w-0 flex-col gap-1.5">
                  <HarmonicOptionButton
                    option={column.overtone}
                    harmonicRatio={harmonicRatio}
                    setHarmonicRatio={setHarmonicRatio}
                  />
                  {column.subharmonic ? (
                    <HarmonicOptionButton
                      option={column.subharmonic}
                      harmonicRatio={harmonicRatio}
                      setHarmonicRatio={setHarmonicRatio}
                    />
                  ) : (
                    <div className="h-[34px]" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/55">Heard</div>
            <div className="mt-1 tabular-nums text-white/80">{formatHz(detectedHz)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/55">Drone</div>
            <div className="mt-1 tabular-nums text-white/80">{formatHz(outputHz)}</div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
