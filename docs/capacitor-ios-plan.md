# Bourdon / Drone-2 → Capacitor iOS Plan

**Status:** Setup phase — Capacitor is added to THIS repo; the use cases below (MIDI,
live audio) are a **future backlog**, not current work
**Target:** This repository (`drone-2`) — no new repo
**Date:** 2026-07-18 (revised after review)
**Source app:** [Drone-2](https://github.com/margokolar/Drone-2) — Bourdon Drone PWA (React + TypeScript + Vite)

---

## 0. Working model (who does what)

Three parties:

- **Margo** — app owner, non-technical, develops by vibe-coding with the AI agent in
  Cursor. Asks for features in plain language, tests on his phone, never touches Xcode,
  git internals, or build tooling.
- **Margo's son** — software developer. Does the **one-time setup** (Xcode install,
  Apple ID in Xcode, iPhone Developer Mode, first signed run, optionally Apple Developer
  Program enrollment). After setup he is not needed for day-to-day work.
- **AI agent** — everything else: Capacitor integration, all code (web + Swift), build
  scripts, `cap sync`, deploy-to-phone, debugging, and later the native plugins and
  TestFlight automation.

### One-time setup checklist (son's part, ~1 evening)

1. Install Xcode on Margo's Mac (App Store), launch once to finish component install.
2. Sign Margo's Apple ID into Xcode (Settings → Accounts).
3. Enable Developer Mode on Margo's iPhone (Settings → Privacy & Security → Developer
   Mode; the toggle appears after the first install attempt) + "Trust this computer".
4. First run from Xcode to the phone: pick signing team, set bundle ID. This is the only
   step that requires clicking inside Xcode; afterwards the agent deploys from the CLI
   (`xcodebuild` / `devicectl`).
5. (Recommended, not blocking) Enroll in Apple Developer Program ($99/yr): removes the
   free-account 7-day app expiry and enables TestFlight, which is the smoothest update
   path for Margo (agent uploads build, Margo taps "Update" in the TestFlight app).

### Agent setup work (after or in parallel with the checklist)

- Add Capacitor to this repo (`capacitor.config.ts`, `ios/` platform). The existing web
  build and Vercel deploy are unaffected and continue as-is.
- One-command deploy script, e.g. `npm run ios` = build → `cap sync ios` → install to the
  connected iPhone.
- A `.cursor/rules` file documenting the iOS workflow (how to build/deploy, signing
  facts, what not to touch), so every future agent session knows the workflow without
  Margo explaining anything.

### Margo's day-to-day loop (the goal state)

1. Margo describes a feature or bug in Cursor.
2. Agent edits code, runs `npm run ios` (or uploads a TestFlight build).
3. Margo tests on the phone and replies with what he sees/hears.

---

## 0b. Scope note: what is current vs future

**Current work:** Phase 0–1 only (Capacitor shell, existing PWA feature set running as a
real iOS app on Margo's phone). No native plugins, no MIDI, no live audio.

**Future backlog:** the use cases in section 2 (live bagpipe processing, BLE MIDI
monitor, sequencer input) and Phases 2–5. Everything written about them below — the
phase ordering, the `.measurement`-mode requirements, the one-owner audio rule — stays
valid and should be followed **when** that work starts, but none of it blocks the setup.

---

## 1. Context and decisions

### What exists today

- Mobile-first **static PWA**: React 19, TypeScript, Vite, Tailwind, Zustand
- Custom **Web Audio** engines (drone, metronome, shine) in `src/audio/`
- Tuning model (equal temperament / just intonation), presets, overtone UI
- MIDI-oriented logic in TS (`src/midi/overtoneMidi.ts`); **Web MIDI does not work on iOS Safari**
- Bluetooth control experiments in the web app
- Deployable as static hosting (Vercel); offline via `vite-plugin-pwa`

### Why leave pure PWA / browser

Browser on iOS cannot reliably provide:

- Web MIDI (computer sequencer → app, BLE MIDI → note display)
- Robust audio session / full-duplex low-latency live audio for performance
- Easy "install and share with friends" as a real iOS app (TestFlight / App Store)

### Chosen architecture

**Capacitor (web UI + logic) + native iOS plugins for MIDI and audio engine.**

| Layer | Technology | Role |
|---|---|---|
| UI, presets, tuning math, most state | React + TypeScript (ported from Drone-2) | Keep existing product surface |
| App shell | Capacitor iOS (WKWebView) | Real `.app`, permissions, plugins |
| MIDI in/out | Native plugin → **Core MIDI** (USB, BLE, Network/RTP-MIDI) | Sequencer + BLE note monitor |
| Live bagpipe path + drones in live mode | Native plugin → **AVAudioEngine** | Mic/interface in → process → speakers/PA; one output graph |
| Drones / metronome (practice mode, no live input) | Existing Web Audio inside WebView | Fast port; fine for playback-only |
| Distribution | Apple Developer Program + TestFlight | Share with friends |

**Not chosen:**

- Full SwiftUI rewrite of the whole app — the audio *engines* must be native, but the UI,
  presets, and tuning math (~90% of existing code) work fine in the WebView. A full rewrite
  throws away a working UI stack to fix a problem that only lives in the audio layer.
- Staying PWA-only — blocks core MIDI / sharing goals
- Relying on free Apple ID sideloading long-term — 7-day expiry, no sane friend sharing

### Apple Developer account

- **Required** for TestFlight / sharing with friends without weekly reinstall pain
- Free Apple ID is OK only for early personal device testing
- Budget: ~$99/year when ready to distribute

---

## 2. Father's use cases (requirements)

### U1 — Live bagpipes support (critical) — DECIDED: signal-chain processing

**Decision made:** the phone is **in the signal path** (pipes → phone → speakers/PA),
not just listening/analyzing. This is the hardest requirement and drives the whole plan:

- Real-time full-duplex audio must live in a **native audio engine** from the start.
- Do not stream audio samples through the JS bridge. JS only sends control parameters
  (mode, gains, targets); Swift processes buffers.
- **This is the biggest project risk, so it gets validated first** (see Phase 2 below),
  before any MIDI work.

Hard technical requirements for the native engine (non-negotiable, discovered in review):

1. **`AVAudioSession`: `.playAndRecord` category + `.measurement` mode.** iOS's default
   voice processing / echo cancellation mangles the bagpipe signal beyond recognition and
   must be off.
2. **No `installTap` for processing.** Taps are high-latency and not meant for DSP. The
   graph must use `AVAudioSourceNode` / `AVAudioSinkNode` or a custom `AUAudioUnit`.
3. **Latency budget:** 128–256 frame buffer @ 48 kHz → realistic round-trip ~10–20 ms on
   iPhone. If measurement shows significantly more, the session config is wrong.
4. **Feedback / routing:** acoustic pipes into the phone mic + PA output in the same room
   ≈ guaranteed feedback (pipes are loud, the built-in mic is omni). The **first-class
   input scenario is a class-compliant USB audio interface** (pickup/instrument mic →
   interface → iPhone). Built-in mic is a fallback for quiet analysis only.
5. **No Bluetooth speakers, ever, in the live path** (100–300 ms latency). Wired output
   only. Document this for him explicitly.
6. **Background audio mode (`audio`) is required**, not optional: without it the app goes
   silent the moment the screen locks mid-tune. Enable it (and/or disable the idle timer
   in live mode).

### U2 — Bluetooth MIDI note monitor

- Small external device takes **Bluetooth MIDI input**
- Should show notes that are playing (from detection and/or app/sequencer)

**Implication:** Native **MIDI output** (BLE MIDI) via Core MIDI plugin. Likely pipeline:
pitch detection and/or internal note state → MIDI note on/off → BLE display.

### U3 — Computer MIDI sequencer → app

- External sequencer on Mac/PC controls the app

**Implication:** Native **MIDI input**. Primary easy path: **Network MIDI (RTP-MIDI)** on
the same Wi‑Fi (iOS `MIDINetworkSession`); also USB MIDI interfaces. BLE MIDI pairing via
`CABTMIDICentralViewController`. Browser on iOS supports none of this.

### U4 — Share with friends

- TestFlight (or App Store) via paid Apple Developer account
- Capacitor vs full native does not change this requirement

---

## 3. Target architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ iOS app (Capacitor)                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ WKWebView: React UI, Zustand, tuning, presets         │  │
│  │ Web Audio drones/metronome (practice mode ONLY —      │  │
│  │ never active at the same time as the live engine)     │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ Capacitor bridge (controls)  │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │ Native plugins                                        │  │
│  │  • AudioEnginePlugin → AVAudioEngine: input →         │  │
│  │    source/sink or AU processing → drone synth →       │  │
│  │    mixer → output (ONE graph owns live audio)         │  │
│  │  • AudioSession    → category, routes, interruptions  │  │
│  │  • MidiPlugin      → Core MIDI in/out (USB/BLE/Net)   │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  USB audio interface     Wired out / PA       MIDI (Mac sequencer,
  (pipes; built-in mic                           BLE note monitor)
   = fallback)
```

### One-owner rule for live audio

`AVAudioSession` is process-wide: WKWebView's Web Audio (controlled by WebKit, not by us)
and the native engine share the same session. WebKit can silently override low-latency /
measurement settings when web audio starts, stops, or a route changes. Therefore:

- **Live mode:** the native engine owns ALL sound — live processing *and* drones. Drone
  synthesis is ported to the native graph (N oscillators at computed frequencies; the
  tuning math stays in TypeScript and only sends "play 233.08 Hz with these overtone
  levels" over the bridge).
- **Practice mode (no live input):** Web Audio drones are fine — playback-only WKWebView
  audio is a solved problem.
- Porting the drones natively is a **planned work item (Phase 4), not a "revisit later"
  risk.**

### Bridge design rules

- **Do:** `startEngine()`, `setInputGain()`, `setProcessMode()`, `setDrone({freq, overtones})`, `subscribeMidiMessage()`
- **Don't:** send PCM audio buffers to JavaScript every render quantum
- Keep musical/tuning helpers in TypeScript; keep real-time DSP and synthesis in Swift

---

## 4. Repository layout

**Decision (revised): Capacitor is added to this repo (`drone-2`) in place — no new repo,
no porting.** One repo, one `main` branch, full git history preserved. The existing web
build and Vercel deployment continue unchanged; Capacitor only adds config, dependencies,
and the `ios/` folder alongside them.

```text
drone-2/
├── package.json             # + @capacitor/core, @capacitor/cli, @capacitor/ios
├── vite.config.ts           # unchanged (dist output)
├── capacitor.config.ts      # NEW
├── index.html
├── src/                     # existing app, unchanged
│   ├── audio/               # Web Audio engines (practice mode)
│   ├── midi/
│   ├── music/
│   ├── store/
│   ├── components/
│   └── native/              # FUTURE: thin TS wrappers around Capacitor plugins
├── ios/                     # NEW: Capacitor-generated Xcode project (committed to git)
│   └── App/
│       └── Plugins/         # FUTURE: custom Swift plugins (Audio, MIDI)
├── docs/
│   └── capacitor-ios-plan.md  # this document
└── .cursor/rules/           # + iOS workflow rule for future agent sessions
```

`vite-plugin-pwa` stays for the web/Vercel target; it is harmless inside the WKWebView
and can be gated later if it ever causes trouble.

---

## 5. Migration plan (phases)

> **Phase 0–1 = current work** (setup + Capacitor shell). **Phases 2–5 = future backlog**,
> to be started when Margo wants the corresponding use case. Within the future work, the
> native audio pass-through (the riskiest part) is validated **before any MIDI
> investment**: if live processing turns out infeasible on the phone, we want to know at
> the start of that effort, not after the MIDI plugin is built.

### Phase 0 — One-time machine/phone setup (Margo's son, ~1 evening)

1. Xcode on Margo's Mac; Apple ID signed into Xcode.
2. Developer Mode on Margo's iPhone; trust pairing with the Mac.
3. First signed run to the device (team + bundle ID) together with the agent.
4. (Recommended) Apple Developer Program enrollment — kills the 7-day expiry, enables
   TestFlight later.

**Exit criteria:** An Xcode-built app (even a blank one) launches on Margo's phone.

### Phase 1 — Capacitor shell in this repo (agent)

1. Add Capacitor; create `ios` platform in this repo (commit `ios/` to git).
2. Build web → `npx cap sync ios` → deploy to the phone.
3. Fix viewport, safe areas, status bar; confirm touch UI and Web Audio playback work
   inside WKWebView (user gesture / resume AudioContext).
4. Add `npm run ios` one-command deploy script.
5. Add `.cursor/rules` iOS-workflow rule so future agent sessions are self-sufficient.

**Margo's part:** none — after this phase he asks for features in Cursor and tests on the
phone; the agent handles builds.
**Exit criteria:** Existing drone app runs from the home-screen icon on his phone, and a
feature request in Cursor can go from prompt → phone without the son involved.

---

> **Everything below is the future backlog** (the use cases in section 2). Keep for
> reference; do not start until Margo asks for these features.

### Phase 2 — Native audio pass-through spike (THE risk validator)

1. Minimal `AudioSessionPlugin`: `.playAndRecord` + `.measurement` mode, preferred buffer
   128–256 frames @ 48 kHz, mic permission, route-change / interruption handling.
2. Minimal `AVAudioEngine` graph: input → (identity processing via source/sink node or
   AU) → output. **No `installTap` in the signal path.**
3. Measure round-trip latency (loopback measurement or clap test). Target ≤ 20 ms.
4. Test with real pipes: built-in mic first for smoke test, then a class-compliant USB
   audio interface. Assess feedback behavior with a real speaker.
5. Enable background `audio` mode; verify audio survives screen lock.
6. Input level meter in UI over the bridge (events, not buffers).

**Margo's part:** play the pipes, report latency feel and any dropouts.
**Exit criteria:** Pipes → phone → wired speaker works with acceptable latency and no iOS
routing surprises. **If this fails, stop and rescope (analysis-only mode) before building
anything else.**

### Phase 3 — Native MIDI plugin

1. Implement a Capacitor plugin wrapping Core MIDI.
2. Features:
   - List inputs/outputs
   - Choose input (Network MIDI session / USB / BLE)
   - Subscribe to note/CC messages → forward to JS
   - Send note on/off (and CC if needed) to BLE monitor
3. Wire JS layer to existing overtone/drone controls and a simple MIDI monitor UI.
4. Document Mac setup: Audio MIDI Setup → Network session; Windows: rtpMIDI.

**Exit criteria:**

- Computer sequencer controls the app over Network MIDI
- App can send notes to the Bluetooth MIDI display device

### Phase 4 — Full live engine: DSP + native drones (one output graph)

1. Extend the Phase 2 graph with v1 processing (freeze scope with him first): e.g. pitch
   detect, gate, EQ, mix-with-drone, limiter — **start minimal**.
2. **Port drone synthesis into the native graph** (planned work, not optional): oscillator
   bank driven by parameters from the existing TypeScript tuning math. In live mode the
   native engine owns all audio; Web Audio remains for practice mode only.
3. Optional: pitch detection → MIDI notes → BLE monitor (connects U1 and U2).
4. Latency + stability tuning with real pipes and speakers in rehearsal conditions.

**Exit criteria:** Live signal-chain path works in rehearsal conditions, drones and
processed pipes mix in one native output graph.

### Phase 5 — Polish and share

1. Paid Apple Developer Program.
2. Signing, bundle ID, icons, privacy usage descriptions.
3. TestFlight internal → invite friends.
4. Feedback loop: he describes issues in Cursor; agent patches; new TestFlight build.
5. Automate archive/upload (Fastlane or GitHub Actions macOS runner) so nobody opens
   Xcode for routine releases.

**Margo's part:** pay the $99, approve App Store Connect prompts, invite testers.
**Exit criteria:** Friends install via TestFlight without Xcode.

---

## 6. Setup steps for the new project

Commands below are a **template** for the new repo machine (macOS required for iOS
builds). The agent runs these; Margo just needs Xcode installed and an Apple ID signed in.

### 6.1 Prerequisites

- macOS with recent **Xcode** (App Store) + Xcode CLT
- **Node.js** LTS + npm (already present — this repo builds today)
- Apple ID (free for personal device; **Developer Program** for TestFlight)
- Physical iPhone required for MIDI + audio I/O truth
- FUTURE (live path only): class-compliant **USB audio interface** + adapter/cable
  (see U1 requirement 4)
- CocoaPods or SPM per current Capacitor install guide

### 6.2 Add Capacitor to this repo

No scaffolding or porting — the app already exists here.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Bourdon" "com.example.bourdon" --web-dir dist
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

In Xcode (one time, son + agent):

1. Select the **App** target → signing team (Personal Team or paid team)
2. Set unique **Bundle Identifier**
3. Connect iPhone → Trust computer → Run

### 6.3 One-command deploy (agent adds)

Add an `ios` npm script that chains `vite build` → `cap sync ios` → CLI install to the
connected device (`xcodebuild` / `xcrun devicectl`), so a deploy is a single command for
every future agent session.

### 6.4 iOS permission strings and capabilities (Info.plist)

- `NSMicrophoneUsageDescription` — bagpipe input / tuning
- Bluetooth keys as required by current iOS for BLE MIDI accessories
- **Background Modes → Audio: enabled** (required for live use; screen lock must not kill
  the sound)

### 6.5 Custom native plugins (overview)

Capacitor custom plugin pattern:

1. Define TypeScript interface in `src/native/`
2. Implement Swift plugin registered with Capacitor
3. Methods for controls + event listeners (`addListener('midiMessage', ...)`)
4. `npx cap sync ios` after native changes when required

**AudioEnginePlugin (sketch):**

- `configureSession()` — playAndRecord + measurement, buffer prefs
- `start()` / `stop()`
- `setParams({ ... })` — gains, mode, EQ; **never audio buffers**
- `setDrone({ freq, overtones, level })` — native drone synth control (live mode)
- Events: `level`, `pitch`, `routeChange`, `interruption`

**MidiPlugin (sketch):**

- `listDevices() → { inputs, outputs }`
- `setInput(id)` / `setOutput(id)`
- `sendNote({ note, velocity, channel })`
- Events: `noteOn`, `noteOff`, `cc`

### 6.6 Dev loop (keep this simple for a non-technical owner)

**Ideal day-to-day for him:**

1. Describe change to the agent in Cursor
2. Agent edits web and/or Swift plugin code
3. Agent (or helper) runs build → TestFlight (or Xcode run on his phone)
4. He taps around and reports what's wrong

**UI-only iteration:** `npm run dev` in desktop browser (no MIDI/BLE/latency truth).
**MIDI/audio truth:** physical iPhone every time.

### 6.7 TestFlight (when sharing)

1. Enroll in Apple Developer Program
2. Create App Store Connect app record
3. Archive from Xcode or CI (Fastlane / GitHub Actions macOS runner)
4. Upload build → TestFlight → invite friends

Automate this so he never opens Xcode.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Live through-processing latency too high | **Validated first** (Phase 2 spike) with measured target ≤ 20 ms; rescope to analysis-only if it fails |
| Feedback with acoustic pipes + PA | USB interface + pickup/close mic as the primary input path; built-in mic is fallback only |
| Web Audio + native engine fight over `AVAudioSession` | One-owner rule: native graph owns ALL audio in live mode (drones ported natively in Phase 4); Web Audio only in practice mode |
| iOS voice processing mangles the signal | `.measurement` mode / voice processing off from day one |
| Wrong DSP plumbing (installTap) | Source/sink nodes or AUAudioUnit specified up front |
| Screen lock kills live audio | Background `audio` mode enabled deliberately |
| Bluetooth speaker latency | Documented as unsupported for live path; wired only |
| Network MIDI fiddly on Windows/venue Wi‑Fi | Document setup; USB MIDI interface fallback |
| Custom Swift plugins hard for non-technical owner | Agent owns plugins; he only tests |
| Scope creep (FX suite, AUv3, etc.) | Freeze v1 processing list with him (section 8) |

---

## 8. Suggested v1 scope freeze

Ship first TestFlight with exactly this, nothing more:

1. **Drones + metronome + tuning/presets** — feature parity with today's PWA (practice
   mode, Web Audio).
2. **Live mode:** pipes in (USB interface or mic) → gain/gate/EQ → mix with native drones
   → limiter → wired out. No further effects in v1.
3. **MIDI in:** Network MIDI (RTP) from a Mac sequencer controls drones/overtones.
4. **MIDI out:** note on/off to the BLE note monitor (from sequencer/app state; pitch
   detection → MIDI can slip to v1.1 if it drags).
5. **No** App Store release, AUv3, Android, recording/export, or extra effects in v1.

Anything not on this list goes to the v1.1+ backlog, agreed with him before adding.
