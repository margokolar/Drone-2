# Drone — guide for coding agents

Drone is a drone/bourdon reference instrument for musicians: sustained tones in
selectable tunings, overtone shaping, presets grouped into songs, a click
(metronome), song loops (L1–L3), "Shine" shimmer harmonics, mic pitch following,
and foot-pedal / MIDI control. It ships as a **web PWA** (Vercel) and as an
**iOS app** (Capacitor) from the same React code.

The owner (Margo) is not a programmer. Talk to him only in product language — see
`.cursor/rules/plain-language.mdc`. Workflow rules (main branch only, "+" shortcut,
iOS deploy) live in `.cursor/rules/`.

## Verify every change

```bash
npm run check   # tsc -b && eslint . && vitest run — must stay green
npm run build   # production web build
```

Run `npm run check` after every batch of edits. Lint has zero warnings today; keep it
that way rather than adding disables (if a disable is truly needed, add a one-line
reason above it, as in `src/hooks/useShine.ts`).

## Map

| Area | Where | Notes |
|---|---|---|
| Entry / platform classes | `src/main.tsx`, `src/utils/platform.ts` | Adds `ios-app` / `capacitor-native` classes to `<html>`/`<body>` |
| Main screen | `src/App.tsx` | ~4000 lines, one big `App()` component holding all tabs and menus. Prefer extracting new UI into `src/components/` instead of growing it |
| App state + persistence | `src/store/useDroneStore.ts` | One Zustand store, persisted to `localStorage` key `bourdon-store-v1` |
| Saved-data upgrades | `migratePersistedDroneState` in the store | See "Persisted data" below |
| Music math | `src/music/` | `notes.ts` (note ids), `tuning.ts` (all tuning systems), `harmonicSeries.ts`, `pitchMatch.ts` |
| Presets & navigation | `src/presets/` | Default presets, prev/next order incl. play/pause markers |
| Audio engines | `src/audio/*Engine.ts` | `DroneEngine` (tones), `ShineEngine`, `LoopEngine`, `MetronomeEngine`, `AddEngine` (mic follower) |
| Store → engine glue | `src/hooks/use*.ts`, `src/audio/runtimeConfigFromStore.ts` | `useAudioEngine` pushes a `DroneRuntimeConfig` into `droneEngine` |
| Transport (play/pause/next) | `src/audio/transportControls.ts`, `src/audio/presetNavigationTransport.ts` | Shared by on-screen buttons, pedals, lock screen |
| Native bridge (TS side) | `src/native/` | `DroneSynth`, `AudioSession`, `Midi` Capacitor plugins |
| Native code (Swift) | `ios/App/App/*.swift` | Plugins registered in `BridgeViewController.swift` |
| Bluetooth pedal / MIDI / Scribble | `src/bluetooth/`, `src/midi/`, `src/scribble/` | |

## Two sound engines — keep them in sync

- **Web / PWA:** Web Audio API inside `src/audio/*Engine.ts`.
- **iOS app:** the same engines detect `isNativeSynth()` (`src/audio/isNativeSynth.ts`)
  and never create an `AudioContext`. Instead `DroneEngine` sends an oscillator graph
  (`src/audio/nativeDroneGraph.ts`) to the Swift synth `ios/App/App/DroneSynthEngine.swift`
  via `src/native/droneSynth.ts` ↔ `ios/App/App/DroneSynthPlugin.swift`.

Any change to how tones sound (glide, fades, wavetables, timbre, gains) must be made in
**both** the TypeScript engine and `DroneSynthEngine.swift`, or the web and iOS versions
will drift apart. If the plugin interface changes, update `src/native/droneSynth.ts` and
the Swift plugin together.

## Persisted data (most important invariant)

Users' presets, songs and settings live in `localStorage` and are upgraded by
`migratePersistedDroneState(state, version)` whenever `DRONE_STORE_PERSIST_VERSION`
changes. That function runs on **every** version bump, so:

- It must be **idempotent**: migrating an already-current save must not change it.
  Version-specific transforms must be gated on `version` (see
  `ENTRY_GLIDE_POLARITY_SWAP_VERSION`).
- Only bump the version when the saved shape changes; add new fields with `??` defaults.
- Add or extend a case in `src/store/migration.test.ts` for every migration change.

## iOS-only UI

Follow `.cursor/rules/ios-visual-only.mdc`: style with the `ios-app:` Tailwind variant,
`.ios-app` CSS scope, or `isIosApp()`. The PWA must stay unchanged unless asked.

## Tests

Vitest, files named `*.test.ts` next to the code (`src/**/*.test.ts`, Node environment).
Existing coverage: tuning math, preset navigation, saved-data migration. Prefer testing
pure functions; engines touching Web Audio or Capacitor are not unit-tested.
