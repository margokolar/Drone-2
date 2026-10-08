import AudioToolbox
import AVFoundation
import Foundation
import MediaPlayer
import UIKit

/// Continuous drone mixer so WKWebView never owns the audio session.
final class DroneSynthEngine {
    static let shared = DroneSynthEngine()

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private let lock = NSLock()
    private var sampleRate = 48_000.0
    private var prepared = false
    private var onScreen = true

    struct OscSpec {
        var id: String
        var wave: Int
        var freq: Double
        var gain: Double
        var pan: Double
        var glideFrom: Double
        var glideSeconds: Double
        var tableId: String = ""
    }

    private struct Osc {
        var id = ""
        var wave = 0
        var tableId = ""
        var phase = 0.0
        var freq = 440.0
        var freqTarget = 440.0
        var freqInc = 0.0
        var gain = 0.0
        var gainTarget = 0.0
        var gainInc = 0.0
        var pan = 0.0
        var panTarget = 0.0
        var active = false
        var releasing = false
    }

    private struct Shine {
        var freq = 0.0
        var phase = 0.0
        var gain = 0.0
        var gainTarget = 0.0
        var pan = 0.0
        var panTarget = 0.0
        var active = false
    }

    private struct Click {
        var freq = 1240.0
        var phase = 0.0
        var amp = 0.0
        var peak = 0.0
        var remaining = 0
        var total = 0
        var attackSamples = 0
        var decayCoeff = 0.0
        var active = false
    }

    private var oscs = Array(repeating: Osc(), count: 768)
    private var shine = Array(repeating: Shine(), count: 16)
    private var clicks = Array(repeating: Click(), count: 4)
    private var liveOsc = 0
    private var master = 0.0001
    private var masterTarget = 0.0001
    private var masterInc = 0.0
    private var waves = BandLimitedWaves()
    private var customWaves: [String: CustomWave] = [:]
    private var limiterEnv = 0.0
    private var heldMaster = 0.3
    private var mixGain = 1.0
    /// Extra output scaler so pause fade covers drone + Shine (Shine is mixed after master).
    private var outputFade = 1.0
    private var outputFadeTarget = 1.0
    private var outputFadeInc = 0.0
    private var storedFadeIn = 0.0
    private var storedFadeOut = 0.0
    private var fadeHoldUntil: TimeInterval = 0
    private var pendingReleaseWork: DispatchWorkItem?
    private(set) var wantsPlaybackSession = false
    private var nowPlayingTitle = "Drone"
    private var nowPlayingArtist = "Drone"
    private var nowPlayingSequence: [String] = []
    private var nowPlayingActiveIndex = -1
    private var metroEnabled = false
    private var metroMuted = false
    private var metroPeak = 0.5
    private var metroBpm = 72.0
    private var clickPlayer: AVAudioPlayerNode?
    private var clickFormat: AVAudioFormat?
    private var metroLoopBuffer: AVAudioPCMBuffer?
    private var metroLoopBpm = 0.0
    private var fileLoopPlayer: AVAudioPlayerNode?
    private var fileLoopFormat: AVAudioFormat?
    private var fileLoopBuffer: AVAudioPCMBuffer?
    private var fileLoopSeconds = 0.0
    private var fileLoopGain: Float = 0.5
    private var fileLoopEnabled = false
    private var fileLoopPlaying = false
    private var fileLoopStopAtEnd = false
    private var fileLoopWriter: FileHandle?
    private var fileLoopBytes = 0
    private var fileLoopExpectedBytes = 0
    private let fileLoopQueue = DispatchQueue(label: "com.margokolar.bourdon.fileloop")
    private let twoPi = 2.0 * Double.pi

    /// Prefer ~23 ms I/O. Never bounce the session while playing.
    private static let ioBufferDuration: TimeInterval = 0.023
    private static let limiterThreshold = pow(10.0, -1.0 / 20.0)

    /// Web Audio OscillatorNode saw/square: Fourier sine series, peak-normalized,
    /// band-limited by frequency. Starts at 0 with positive slope, in phase with sine.
    private struct BandLimitedWaves {
        private let size = 4096
        private let mask = 4095
        private let counts = [256, 128, 64, 32, 16, 8, 4, 2]
        private var saw: [[Double]] = []
        private var square: [[Double]] = []

        mutating func prepare() {
            if !saw.isEmpty { return }
            saw = counts.map { makeTable(harmonics: $0, square: false) }
            square = counts.map { makeTable(harmonics: $0, square: true) }
            normalize(&saw)
            normalize(&square)
        }

        func sample(isSquare: Bool, phase: Double, freq: Double, sampleRate: Double) -> Double {
            let tables = isSquare ? square : saw
            guard !tables.isEmpty else { return 0 }
            let allowed = max(1, Int(sampleRate * 0.49 / max(freq, 1)))
            var index = counts.count - 1
            for i in counts.indices where counts[i] <= allowed {
                index = i
                break
            }
            let table = tables[index]
            let pos = phase * Double(size)
            let i0 = Int(pos) & mask
            let frac = pos - floor(pos)
            let i1 = (i0 + 1) & mask
            return table[i0] + (table[i1] - table[i0]) * frac
        }

        private func makeTable(harmonics: Int, square: Bool) -> [Double] {
            var table = Array(repeating: 0.0, count: size)
            let stepBase = 2.0 * Double.pi / Double(size)
            for harmonic in 1...harmonics {
                let piFactor = 2.0 / (Double(harmonic) * Double.pi)
                let b: Double
                if square {
                    guard (harmonic & 1) == 1 else { continue }
                    b = 2 * piFactor
                } else {
                    b = piFactor * ((harmonic & 1) == 1 ? 1.0 : -1.0)
                }
                let step = stepBase * Double(harmonic)
                var phase = 0.0
                for i in 0..<size {
                    table[i] += b * sin(phase)
                    phase += step
                }
            }
            return table
        }

        private func normalize(_ tables: inout [[Double]]) {
            guard let richest = tables.first else { return }
            var peak = 0.0
            for sample in richest {
                peak = max(peak, abs(sample))
            }
            guard peak > 0 else { return }
            let scale = 1.0 / peak
            for t in tables.indices {
                for i in tables[t].indices {
                    tables[t][i] *= scale
                }
            }
        }
    }

    private struct CustomWave {
        private let size = 4096
        private let mask = 4095
        private let counts = [256, 128, 64, 32, 16, 8, 4, 2]
        private var tables: [[Double]] = []

        init(real: [Double], imag: [Double]) {
            let harmonicLimit = max(1, min(real.count, imag.count) - 1)
            tables = counts.map { count in
                Self.makeTable(harmonics: min(count, harmonicLimit), real: real, imag: imag, size: size)
            }
        }

        func sample(phase: Double, freq: Double, sampleRate: Double) -> Double {
            guard !tables.isEmpty else { return 0 }
            let allowed = max(1, Int(sampleRate * 0.49 / max(freq, 1)))
            var index = counts.count - 1
            for i in counts.indices where counts[i] <= allowed {
                index = i
                break
            }
            let table = tables[index]
            let pos = phase * Double(size)
            let i0 = Int(pos) & mask
            let frac = pos - floor(pos)
            let i1 = (i0 + 1) & mask
            return table[i0] + (table[i1] - table[i0]) * frac
        }

        private static func makeTable(harmonics: Int, real: [Double], imag: [Double], size: Int) -> [Double] {
            var table = Array(repeating: 0.0, count: size)
            let stepBase = 2.0 * Double.pi / Double(size)
            for harmonic in 1...harmonics {
                let a = harmonic < real.count ? real[harmonic] : 0
                let b = harmonic < imag.count ? imag[harmonic] : 0
                if a == 0 && b == 0 { continue }
                let step = stepBase * Double(harmonic)
                var phase = 0.0
                for i in 0..<size {
                    table[i] += a * cos(phase) + b * sin(phase)
                    phase += step
                }
            }
            return table
        }
    }

    private init() {}

    static var isCarAudioRoute: Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains { output in
            if output.portType == .carAudio {
                return true
            }
            let name = output.portName.lowercased()
            return name.contains("carplay") || name.contains("car audio")
        }
    }

    func applyPlaybackSession() throws {
        if Self.isCarAudioRoute {
            releasePlaybackSession(immediate: true)
            return
        }
        wantsPlaybackSession = true
        let session = AVAudioSession.sharedInstance()
        if session.category != .playback || !session.categoryOptions.isEmpty {
            try session.setCategory(.playback, mode: .default, options: [])
        }
        try session.setPreferredIOBufferDuration(Self.ioBufferDuration)
        try session.setActive(true, options: [])
    }

    func appearOnScreen() {
        onScreen = true
    }

    func releasePlaybackSession(immediate: Bool = false) {
        wantsPlaybackSession = false
        if immediate {
            fadeHoldUntil = 0
            pendingReleaseWork?.cancel()
            pendingReleaseWork = nil
            finishReleasePlaybackSession()
            return
        }
        let remaining = fadeHoldUntil - ProcessInfo.processInfo.systemUptime
        if remaining > 0.02 {
            pendingReleaseWork?.cancel()
            let work = DispatchWorkItem { [weak self] in
                guard let self, !self.wantsPlaybackSession else { return }
                self.finishReleasePlaybackSession()
            }
            pendingReleaseWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + remaining, execute: work)
            return
        }
        finishReleasePlaybackSession()
    }

    private func finishReleasePlaybackSession() {
        pendingReleaseWork = nil
        fadeHoldUntil = 0
        suspend()
        Self.publishNowPlaying(playing: false)
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            // Already inactive.
        }
    }

    private func noteFadeHold(seconds: Double) {
        let hold = ProcessInfo.processInfo.systemUptime + max(0, seconds) + 0.06
        fadeHoldUntil = max(fadeHoldUntil, hold)
    }

    private func rampOutputFadeLocked(to target: Double, seconds: Double, sampleRate sr: Double) {
        let dest = max(0, min(1, target))
        outputFadeTarget = dest
        if seconds <= 0.001 {
            outputFade = dest
            outputFadeInc = 0
            return
        }
        outputFadeInc = (dest - outputFade) / (seconds * sr)
    }

    func park() {
        onScreen = false
        if engine.isRunning {
            engine.stop()
        }
        lock.lock()
        for i in oscs.indices { oscs[i].active = false }
        for i in shine.indices { shine[i].active = false }
        for i in clicks.indices { clicks[i].active = false }
        liveOsc = 0
        master = 0.0001
        masterTarget = 0.0001
        masterInc = 0
        mixGain = 0
        outputFade = 0
        outputFadeTarget = 0
        outputFadeInc = 0
        fadeHoldUntil = 0
        pendingReleaseWork?.cancel()
        pendingReleaseWork = nil
        metroEnabled = false
        limiterEnv = 0
        fileLoopPlaying = false
        fileLoopStopAtEnd = false
        lock.unlock()
        clickPlayer?.stop()
        fileLoopPlayer?.stop()
        Self.publishNowPlaying(playing: false)
    }

    func suspend() {
        if engine.isRunning {
            engine.pause()
        }
        Self.publishNowPlaying(playing: false)
    }

    func setNowPlayingLabels(title: String, artist: String, sequence: [String] = [], activeIndex: Int = -1) {
        let nextTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextArtist = artist.trimmingCharacters(in: .whitespacesAndNewlines)
        nowPlayingTitle = nextTitle.isEmpty ? "Drone" : nextTitle
        nowPlayingArtist = nextArtist.isEmpty ? "Drone" : nextArtist
        nowPlayingSequence = sequence.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        nowPlayingActiveIndex = activeIndex
        Self.publishNowPlaying(playing: isAudible)
    }

    var isAudible: Bool {
        lock.lock()
        defer { lock.unlock() }
        if fileLoopPlaying && fileLoopSeconds > 0.01 && fileLoopGain > 0.0001 {
            return true
        }
        let live = (0..<min(liveOsc, oscs.count)).contains { oscs[$0].active && oscs[$0].gain > 0.00005 }
        let shimmer = shine.contains { $0.active && $0.gain > 0.0002 }
        return mixGain > 0.5 && outputFade > 0.01 && ((master > 0.01 && live) || shimmer)
    }

    func resumeAfterRemote() {
        onScreen = true
        wantsPlaybackSession = true
        mixGain = 1
        fadeHoldUntil = 0
        pendingReleaseWork?.cancel()
        pendingReleaseWork = nil
        try? startIfNeeded()
        lock.lock()
        if master > 0.01 {
            master = 0.0001
            masterTarget = 0.0001
            masterInc = 0
        }
        let target = max(0.05, heldMaster)
        let seconds = storedFadeIn > 0.001 ? storedFadeIn : 0.08
        lock.unlock()
        fadeMaster(to: target, seconds: seconds)
        Self.publishNowPlaying(playing: true)
    }

    func reclaim() throws {
        onScreen = true
        guard wantsPlaybackSession else { return }
        try startIfNeeded()
    }

    func mute() {
        lock.lock()
        heldMaster = max(heldMaster, max(master, masterTarget))
        mixGain = 1
        lock.unlock()
        fadeMaster(to: 0.0001, seconds: storedFadeOut)
        Self.publishNowPlaying(playing: false)
    }

    func fadeMaster(to target: Double, seconds: Double) {
        if seconds > 0.001 {
            do {
                try startIfNeeded()
            } catch {
                NSLog("DroneSynth fade start failed: \(error.localizedDescription)")
            }
        }
        let sr = sampleRate
        let dest = max(0.0001, target)
        lock.lock()
        if dest > 0.01 {
            heldMaster = dest
            mixGain = 1
            rampOutputFadeLocked(to: 1, seconds: seconds, sampleRate: sr)
        }
        if seconds <= 0.001 {
            master = dest
            masterTarget = dest
            masterInc = 0
            if dest <= 0.01 {
                rampOutputFadeLocked(to: 0, seconds: 0, sampleRate: sr)
            }
        } else {
            masterTarget = dest
            masterInc = (dest - master) / (seconds * sr)
            if dest <= 0.01 {
                rampOutputFadeLocked(to: 0, seconds: seconds, sampleRate: sr)
            }
        }
        lock.unlock()
        if dest <= 0.01 {
            noteFadeHold(seconds: seconds)
        }
        Self.publishNowPlaying(playing: dest > 0.01 || seconds > 0.001)
    }

    func setGraph(
        master: Double,
        fadeSeconds: Double,
        fadeInSeconds: Double,
        fadeOutSeconds: Double,
        oscillators: [OscSpec],
        wavetables: [String: (real: [Double], imag: [Double])] = [:]
    ) {
        onScreen = true
        storedFadeIn = max(0, fadeInSeconds)
        storedFadeOut = max(0, fadeOutSeconds)
        var nextWaves: [String: CustomWave] = [:]
        for (id, coeffs) in wavetables {
            nextWaves[id] = CustomWave(real: coeffs.real, imag: coeffs.imag)
        }
        do {
            try startIfNeeded()
        } catch {
            NSLog("DroneSynth start failed: \(error.localizedDescription)")
        }
        let sr = sampleRate
        lock.lock()
        customWaves = nextWaves
        let snapshot = Array(oscs.prefix(liveOsc))
        let currentMaster = self.master
        lock.unlock()

        let hasLive = snapshot.contains { $0.active && $0.gain > 0.00005 }
        let audible = currentMaster > 0.01 && hasLive
        // Fade voices whenever a duration is set. Requiring master > 0.01 made
        // play-after-mute snap oscillators to full gain (a pop) while master ramped.
        let fromSilence = fadeSeconds > 0.001 && (!hasLive || currentMaster <= 0.01)
        let overlap = fadeSeconds > 0.025 && hasLive
        let fadeIn = overlap || fromSilence

        if oscillators.isEmpty {
            var built: [Osc] = []
            if fadeSeconds > 0.001 && hasLive {
                built.reserveCapacity(snapshot.count)
                for old in snapshot {
                    if !old.active && old.gain < 0.00005 { continue }
                    guard built.count < oscs.count else { break }
                    var osc = old
                    osc.gainTarget = 0
                    osc.releasing = true
                    osc.active = old.gain > 0.00005
                    osc.freqInc = 0
                    osc.gainInc = (0 - max(old.gain, 0.0001)) / (fadeSeconds * sr)
                    built.append(osc)
                }
            }
            lock.lock()
            for i in oscs.indices {
                if i < built.count {
                    oscs[i] = built[i]
                } else {
                    oscs[i].active = false
                    oscs[i].gain = 0
                    oscs[i].gainInc = 0
                }
            }
            liveOsc = built.count
            if fadeSeconds <= 0.001 {
                self.master = 0.0001
                masterTarget = 0.0001
                masterInc = 0
                rampOutputFadeLocked(to: 0, seconds: 0, sampleRate: sr)
            } else {
                self.master = currentMaster
                masterTarget = 0.0001
                masterInc = (0.0001 - self.master) / (fadeSeconds * sr)
                rampOutputFadeLocked(to: 0, seconds: fadeSeconds, sampleRate: sr)
            }
            lock.unlock()
            noteFadeHold(seconds: fadeSeconds)
            Self.publishNowPlaying(playing: isAudible)
            return
        }

        let releaseSeconds = overlap ? fadeSeconds : 0.03

        var byId: [String: Osc] = [:]
        if audible {
            byId.reserveCapacity(snapshot.count)
            for osc in snapshot {
                byId[osc.id] = osc
            }
        }

        var usedIds = Set<String>()
        usedIds.reserveCapacity(oscillators.count)
        var built: [Osc] = []
        built.reserveCapacity(min(oscillators.count + snapshot.count, oscs.count))
        for spec in oscillators {
            guard built.count < oscs.count else { break }
            usedIds.insert(spec.id)
            var osc = Osc()
            osc.id = spec.id
            osc.wave = spec.wave
            osc.tableId = spec.tableId
            osc.freqTarget = max(1, spec.freq)
            osc.gainTarget = max(0, spec.gain)
            osc.panTarget = max(-1, min(1, spec.pan))
            osc.releasing = false
            osc.active = spec.gain > 0.00005 || fadeIn
            if spec.glideSeconds > 0, spec.glideFrom > 0 {
                osc.freq = spec.glideFrom
                osc.freqInc = (spec.freq - spec.glideFrom) / (spec.glideSeconds * sr)
                osc.pan = osc.panTarget
                if fadeIn {
                    osc.gain = 0
                    osc.gainInc = spec.gain / (fadeSeconds * sr)
                } else {
                    osc.gain = spec.gain
                    osc.gainInc = 0
                }
            } else if audible, let existing = byId[spec.id], existing.active || existing.gain > 0.00005 {
                osc.freq = existing.freq
                osc.phase = existing.phase
                osc.gain = existing.gain
                osc.pan = existing.pan
                let delta = spec.freq - existing.freq
                if overlap {
                    osc.gainInc = (osc.gainTarget - existing.gain) / (fadeSeconds * sr)
                    osc.freqInc = abs(delta) > 0.05 ? delta / (fadeSeconds * sr) : 0
                } else {
                    osc.gainInc = 0
                    osc.freqInc = abs(delta) > 0.05 ? delta / (0.04 * sr) : 0
                }
                if abs(delta) <= 0.05 {
                    osc.freq = spec.freq
                    osc.freqInc = 0
                }
            } else {
                osc.freq = spec.freq
                osc.freqInc = 0
                osc.pan = osc.panTarget
                if fadeIn {
                    osc.gain = 0
                    osc.gainInc = spec.gain / (fadeSeconds * sr)
                } else {
                    osc.gain = spec.gain
                    osc.gainInc = 0
                }
            }
            built.append(osc)
        }

        if audible {
            for old in snapshot {
                if usedIds.contains(old.id) { continue }
                if !old.active && old.gain < 0.00005 { continue }
                guard built.count < oscs.count else { break }
                var osc = old
                osc.gainTarget = 0
                osc.releasing = true
                osc.active = old.gain > 0.00005
                osc.freqInc = 0
                osc.gainInc = (0 - old.gain) / (releaseSeconds * sr)
                built.append(osc)
            }
        }

        lock.lock()
        for i in oscs.indices {
            if i < built.count {
                oscs[i] = built[i]
            } else {
                oscs[i].active = false
            }
        }
        liveOsc = built.count
        if fadeSeconds <= 0.001 {
            self.master = max(0.0001, master)
            masterTarget = self.master
            masterInc = 0
        } else if fromSilence {
            self.master = 0.0001
            masterTarget = max(0.0001, master)
            masterInc = (masterTarget - self.master) / (fadeSeconds * sr)
        } else {
            self.master = currentMaster
            masterTarget = max(0.0001, master)
            masterInc = (masterTarget - self.master) / (fadeSeconds * sr)
        }
        if masterTarget > 0.01 {
            heldMaster = masterTarget
            mixGain = 1
            rampOutputFadeLocked(to: 1, seconds: fromSilence ? fadeSeconds : 0, sampleRate: sr)
        }
        lock.unlock()
        fadeHoldUntil = 0
        pendingReleaseWork?.cancel()
        pendingReleaseWork = nil
        Self.publishNowPlaying(playing: isAudible)
    }

    func setShine(items: [[String: Any]]) {
        onScreen = true
        do {
            try startIfNeeded()
        } catch {
            NSLog("DroneSynth shine start failed: \(error.localizedDescription)")
        }
        var parsed: [(freq: Double, gain: Double, pan: Double)] = []
        parsed.reserveCapacity(min(items.count, shine.count))
        for item in items.prefix(shine.count) {
            parsed.append((Self.num(item, "freq"), Self.num(item, "gain"), Self.num(item, "pan")))
        }
        lock.lock()
        for i in shine.indices {
            if i < parsed.count {
                shine[i].freq = max(1, parsed[i].freq)
                shine[i].gainTarget = max(0, parsed[i].gain)
                shine[i].panTarget = max(-1, min(1, parsed[i].pan))
                shine[i].active = shine[i].gainTarget > 0.0002 || shine[i].gain > 0.0002
            } else {
                shine[i].gainTarget = 0
            }
        }
        lock.unlock()
    }

    func clearShine() {
        lock.lock()
        for i in shine.indices {
            shine[i].gainTarget = 0
            shine[i].gain = 0
            shine[i].active = false
        }
        lock.unlock()
    }

    func setMetronome(enabled: Bool, bpm: Double, volumeDb: Double, muted: Bool) {
        onScreen = true
        let tempo = min(404, max(30, bpm))
        let peak = min(1, max(0.001, pow(10.0, volumeDb / 20.0) * 1.8))
        lock.lock()
        let wasOn = metroEnabled && !metroMuted
        let bpmChanged = abs(metroBpm - tempo) > 0.2
        metroEnabled = enabled
        metroMuted = muted
        metroPeak = peak
        metroBpm = tempo
        lock.unlock()
        let nowOn = enabled && !muted
        let apply = {
            self.clickPlayer?.volume = Float(peak)
            if !nowOn {
                self.clickPlayer?.stop()
                return
            }
            do {
                self.wantsPlaybackSession = true
                try self.startIfNeeded()
            } catch {
                NSLog("DroneSynth metronome start failed: \(error.localizedDescription)")
                return
            }
            self.ensureClickPlayer()
            self.clickPlayer?.volume = Float(peak)
            if !wasOn || bpmChanged || !(self.clickPlayer?.isPlaying ?? false) {
                self.startLoopingMetro(bpm: tempo, rebuild: !wasOn || bpmChanged || self.metroLoopBuffer == nil)
            }
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    func loopDurationSeconds() -> Double {
        fileLoopSeconds
    }

    func loopPlaybackSnapshot() -> (playing: Bool, duration: Double, position: Double) {
        let duration = fileLoopSeconds
        let playing = fileLoopPlaying && (fileLoopPlayer?.isPlaying ?? false) && duration > 0.02
        guard playing, let player = fileLoopPlayer else {
            return (playing, duration, 0)
        }
        guard
            let nodeTime = player.lastRenderTime,
            let playerTime = player.playerTime(forNodeTime: nodeTime),
            playerTime.sampleRate > 1
        else {
            return (true, duration, -1)
        }
        let elapsed = Double(playerTime.sampleTime) / playerTime.sampleRate
        guard elapsed.isFinite, elapsed >= 0 else {
            return (true, duration, -1)
        }
        return (true, duration, elapsed.truncatingRemainder(dividingBy: duration))
    }

    func beginLoopAudio(expectedBytes: Int = 0, completion: (() -> Void)? = nil) {
        fileLoopQueue.async {
            self.resetLoopFileWriter()
            self.fileLoopExpectedBytes = max(0, expectedBytes)
            DispatchQueue.main.async {
                self.fileLoopPlayer?.stop()
                self.fileLoopBuffer = nil
                self.fileLoopSeconds = 0
                self.lock.lock()
                self.fileLoopPlaying = false
                self.fileLoopStopAtEnd = false
                self.lock.unlock()
                completion?()
            }
        }
    }

    func appendLoopAudio(_ data: Data, completion: (() -> Void)? = nil) {
        fileLoopQueue.async {
            do {
                if self.fileLoopWriter == nil {
                    self.resetLoopFileWriter()
                }
                try self.fileLoopWriter?.write(contentsOf: data)
                self.fileLoopBytes += data.count
            } catch {
                NSLog("DroneSynth loop append: \(error.localizedDescription)")
            }
            DispatchQueue.main.async { completion?() }
        }
    }

    func finishLoopAudio(completion: ((Double, Int) -> Void)? = nil) {
        fileLoopQueue.async {
            self.closeLoopFileWriter()
            let bytes = self.fileLoopBytes
            NSLog(
                "DroneSynth loop received bytes=%d expected=%d",
                bytes,
                self.fileLoopExpectedBytes
            )
            self.decodeInstalledLoop { duration in
                completion?(duration, bytes)
            }
        }
    }

    func setLoopAudio(data: Data, completion: ((Double) -> Void)? = nil) {
        fileLoopQueue.async {
            self.closeLoopFileWriter()
            do {
                try data.write(to: self.loopFileURL(), options: .atomic)
                self.fileLoopBytes = data.count
                self.fileLoopExpectedBytes = data.count
            } catch {
                NSLog("DroneSynth loop write: \(error.localizedDescription)")
                DispatchQueue.main.async { completion?(0) }
                return
            }
            self.decodeInstalledLoop(completion: completion)
        }
    }

    func setLoopPlayback(enabled: Bool, volumeDb: Double, muted: Bool, restart: Bool, stopAtEnd: Bool = false) {
        let gain = muted ? 0 : Float(min(1, max(0, pow(10.0, volumeDb / 20.0))))
        let apply = {
            self.lock.lock()
            self.fileLoopGain = gain
            self.lock.unlock()
            self.fileLoopPlayer?.volume = gain
            if !enabled {
                self.fileLoopEnabled = false
                if stopAtEnd && self.fileLoopPlaying {
                    self.stopFileLoopAtCycleEnd()
                } else {
                    self.fileLoopStopAtEnd = false
                    self.fileLoopPlaying = false
                    self.fileLoopPlayer?.stop()
                }
                Self.publishNowPlaying(playing: self.isAudible)
                return
            }
            let wasStopping = self.fileLoopStopAtEnd
            self.fileLoopStopAtEnd = false
            self.fileLoopEnabled = true
            self.wantsPlaybackSession = true
            do {
                try self.startIfNeeded()
            } catch {
                NSLog("DroneSynth loop start failed: \(error.localizedDescription)")
                return
            }
            self.startFileLoop(restart: restart || wasStopping || !(self.fileLoopPlayer?.isPlaying ?? false))
            Self.publishNowPlaying(playing: self.isAudible)
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    func clearLoopAudio() {
        let apply = {
            self.fileLoopEnabled = false
            self.fileLoopPlaying = false
            self.fileLoopStopAtEnd = false
            self.fileLoopPlayer?.stop()
            self.fileLoopBuffer = nil
            self.fileLoopSeconds = 0
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
        fileLoopQueue.async {
            self.closeLoopFileWriter()
            self.fileLoopBytes = 0
            self.fileLoopExpectedBytes = 0
            try? FileManager.default.removeItem(at: self.loopFileURL())
        }
    }

    func click(frequency: Double, peak: Double) {
        onScreen = true
        wantsPlaybackSession = true
        try? startIfNeeded()
        let level = max(0, min(1, peak))
        guard level > 0.0001 else { return }
        lock.lock()
        armClickLocked(frequency: max(80, frequency), peak: level)
        lock.unlock()
    }

    private func armClickLocked(frequency: Double, peak: Double) {
        let sr = sampleRate
        guard let index = clicks.firstIndex(where: { !$0.active }) else { return }
        clicks[index].freq = frequency
        clicks[index].phase = 0
        clicks[index].amp = 0.0001
        clicks[index].peak = peak
        clicks[index].attackSamples = max(1, Int(0.001 * sr))
        clicks[index].total = max(clicks[index].attackSamples + 1, Int(0.055 * sr))
        clicks[index].remaining = clicks[index].total
        clicks[index].decayCoeff = 1.0 - exp(-1.0 / (0.012 * sr))
        clicks[index].active = true
    }

    private static func num(_ raw: [String: Any], _ key: String) -> Double {
        if let value = raw[key] as? Double { return value }
        if let value = raw[key] as? NSNumber { return value.doubleValue }
        if let value = raw[key] as? Int { return Double(value) }
        if let value = raw[key] as? String, let parsed = Double(value) { return parsed }
        return 0
    }

    private func startIfNeeded() throws {
        guard onScreen, wantsPlaybackSession else { return }
        if Self.isCarAudioRoute {
            releasePlaybackSession(immediate: true)
            return
        }
        try prepare()
        try applyPlaybackSession()
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
            var runningRate = source?.outputFormat(forBus: 0).sampleRate ?? 0
            if runningRate < 1000 {
                runningRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
            }
            if runningRate >= 1000, abs(runningRate - sampleRate) > 0.5 {
                sampleRate = runningRate
            }
            waves.prepare()
        }
    }

    private func prepare() throws {
        if prepared { return }
        try applyPlaybackSession()
        let session = AVAudioSession.sharedInstance()
        var hwRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        if hwRate < 1000 {
            hwRate = session.sampleRate > 0 ? session.sampleRate : 48_000
        }
        sampleRate = hwRate
        waves.prepare()
        limiterEnv = 0
        guard let format = AVAudioFormat(standardFormatWithSampleRate: hwRate, channels: 2) else {
            throw NSError(domain: "DroneSynthEngine", code: 1)
        }
        let node = AVAudioSourceNode(format: format) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            self?.render(frameCount: Int(frameCount), audioBufferList: audioBufferList)
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        let loopPlayer = AVAudioPlayerNode()
        engine.attach(loopPlayer)
        engine.connect(loopPlayer, to: engine.mainMixerNode, format: format)
        fileLoopPlayer = loopPlayer
        let metroPlayer = AVAudioPlayerNode()
        engine.attach(metroPlayer)
        engine.connect(metroPlayer, to: engine.mainMixerNode, format: format)
        clickPlayer = metroPlayer
        clickFormat = format
        fileLoopFormat = format
        engine.mainMixerNode.outputVolume = 1
        source = node
        prepared = true
    }

    private func ensureClickPlayer() {
        if clickPlayer != nil { return }
        let running = engine.isRunning
        if running {
            engine.pause()
        }
        let sr = max(1000, sampleRate)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2) else { return }
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        clickPlayer = player
        clickFormat = format
        try? engine.start()
    }

    private func loopFileURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("drone-file-loop.wav")
    }

    private func closeLoopFileWriter() {
        do {
            try fileLoopWriter?.synchronize()
            try fileLoopWriter?.close()
        } catch {
            NSLog("DroneSynth loop close: \(error.localizedDescription)")
        }
        fileLoopWriter = nil
    }

    private func resetLoopFileWriter() {
        closeLoopFileWriter()
        fileLoopBytes = 0
        let url = loopFileURL()
        try? FileManager.default.removeItem(at: url)
        FileManager.default.createFile(atPath: url.path, contents: nil)
        do {
            fileLoopWriter = try FileHandle(forWritingTo: url)
        } catch {
            NSLog("DroneSynth loop create: \(error.localizedDescription)")
            fileLoopWriter = nil
        }
    }

    private func decodeInstalledLoop(completion: ((Double) -> Void)?) {
        DispatchQueue.main.async {
            self.wantsPlaybackSession = true
            do {
                try self.startIfNeeded()
            } catch {
                NSLog("DroneSynth loop prepare: \(error.localizedDescription)")
            }
            guard let destFormat = self.fileLoopFormat ?? self.clickFormat ?? AVAudioFormat(
                standardFormatWithSampleRate: max(1000, self.sampleRate),
                channels: 2
            ) else {
                completion?(0)
                return
            }
            self.fileLoopQueue.async {
                let buffer = self.makeLoopBuffer(url: self.loopFileURL(), format: destFormat)
                let duration: Double
                if let buffer, buffer.format.sampleRate > 1, buffer.frameLength > 1 {
                    duration = Double(buffer.frameLength) / buffer.format.sampleRate
                } else {
                    duration = 0
                }
                DispatchQueue.main.async {
                    self.fileLoopBuffer = buffer
                    self.fileLoopSeconds = duration
                    NSLog(
                        "DroneSynth loop buffer frames=%u duration=%.3f bytes=%d",
                        buffer?.frameLength ?? 0,
                        duration,
                        self.fileLoopBytes
                    )
                    if self.fileLoopEnabled {
                        self.startFileLoop(restart: true)
                    }
                    completion?(duration)
                }
            }
        }
    }

    private func makeLoopBuffer(url: URL, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let (left, right, srcRate) = readLoopPCM(url)
        guard left.count > 1, srcRate > 1 else { return nil }
        let (outL, outR) = Self.resampleArrays(
            left: left,
            right: right,
            srcRate: srcRate,
            destRate: format.sampleRate
        )
        guard outL.count > 1,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(outL.count))
        else { return nil }
        buffer.frameLength = AVAudioFrameCount(outL.count)
        let count = outL.count
        guard let dst = buffer.floatChannelData else { return nil }
        if format.isInterleaved {
            for i in 0..<count {
                dst[0][i * 2] = outL[i]
                dst[0][i * 2 + 1] = outR[i]
            }
        } else {
            outL.withUnsafeBufferPointer { src in
                if let base = src.baseAddress {
                    dst[0].update(from: base, count: count)
                }
            }
            outR.withUnsafeBufferPointer { src in
                if let base = src.baseAddress {
                    dst[Int(format.channelCount > 1 ? 1 : 0)].update(from: base, count: count)
                }
            }
        }
        return buffer
    }

    private func readLoopPCM(_ url: URL) -> (left: [Float], right: [Float], srcRate: Double) {
        if let loaded = readLoopPCMWithAVAudioFile(url), loaded.left.count > 64 {
            return loaded
        }
        return readLoopPCMWithExtAudioFile(url)
    }

    private func readLoopPCMWithAVAudioFile(_ url: URL) -> (left: [Float], right: [Float], srcRate: Double)? {
        do {
            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let total = AVAudioFrameCount(file.length)
            guard total > 1, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: total) else {
                return nil
            }
            file.framePosition = 0
            try file.read(into: buffer, frameCount: total)
            NSLog(
                "DroneSynth loop avread frames=%u of %u sr=%.0f",
                buffer.frameLength,
                total,
                format.sampleRate
            )
            guard buffer.frameLength > 64 else { return nil }
            return floats(from: buffer, srcRate: format.sampleRate)
        } catch {
            NSLog("DroneSynth loop avread: \(error.localizedDescription)")
            return nil
        }
    }

    private func readLoopPCMWithExtAudioFile(_ url: URL) -> (left: [Float], right: [Float], srcRate: Double) {
        var ext: ExtAudioFileRef?
        var status = ExtAudioFileOpenURL(url as CFURL, &ext)
        guard status == noErr, let extFile = ext else {
            NSLog("DroneSynth loop open %d", status)
            return ([], [], 0)
        }
        defer { ExtAudioFileDispose(extFile) }

        var fileFormat = AudioStreamBasicDescription()
        var propSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        status = ExtAudioFileGetProperty(extFile, kExtAudioFileProperty_FileDataFormat, &propSize, &fileFormat)
        guard status == noErr else { return ([], [], 0) }

        var headerFrames: Int64 = 0
        propSize = UInt32(MemoryLayout<Int64>.size)
        ExtAudioFileGetProperty(extFile, kExtAudioFileProperty_FileLengthFrames, &propSize, &headerFrames)

        let srcRate = fileFormat.mSampleRate > 1 ? fileFormat.mSampleRate : 44_100
        guard let client = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: srcRate,
            channels: 2,
            interleaved: false
        ) else { return ([], [], 0) }

        var asbd = client.streamDescription.pointee
        propSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        status = ExtAudioFileSetProperty(extFile, kExtAudioFileProperty_ClientDataFormat, propSize, &asbd)
        guard status == noErr else {
            NSLog("DroneSynth loop client %d", status)
            return ([], [], 0)
        }

        let chunkFrames: AVAudioFrameCount = 16_384
        guard let chunk = AVAudioPCMBuffer(pcmFormat: client, frameCapacity: chunkFrames) else {
            return ([], [], 0)
        }
        var left: [Float] = []
        var right: [Float] = []
        left.reserveCapacity(max(16_384, Int(headerFrames)))
        right.reserveCapacity(max(16_384, Int(headerFrames)))

        while true {
            var frames = UInt32(chunkFrames)
            chunk.frameLength = chunkFrames
            status = ExtAudioFileRead(extFile, &frames, chunk.mutableAudioBufferList)
            if status != noErr {
                NSLog("DroneSynth loop read %d after %d", status, left.count)
                break
            }
            if frames == 0 { break }
            chunk.frameLength = frames
            guard let channels = chunk.floatChannelData else { break }
            let count = Int(frames)
            left.append(contentsOf: UnsafeBufferPointer(start: channels[0], count: count))
            right.append(contentsOf: UnsafeBufferPointer(start: channels[1], count: count))
        }
        NSLog("DroneSynth loop ext frames=%d header=%lld sr=%.0f", left.count, headerFrames, srcRate)
        return (left, right, srcRate)
    }

    private func floats(from buffer: AVAudioPCMBuffer, srcRate: Double) -> (left: [Float], right: [Float], srcRate: Double) {
        let frames = Int(buffer.frameLength)
        let channels = Int(buffer.format.channelCount)
        guard frames > 1, channels >= 1 else { return ([], [], 0) }
        var left = [Float](repeating: 0, count: frames)
        var right = [Float](repeating: 0, count: frames)
        if let data = buffer.floatChannelData {
            if buffer.format.isInterleaved {
                for i in 0..<frames {
                    left[i] = data[0][i * channels]
                    right[i] = channels > 1 ? data[0][i * channels + 1] : left[i]
                }
            } else {
                left = Array(UnsafeBufferPointer(start: data[0], count: frames))
                right = channels > 1
                    ? Array(UnsafeBufferPointer(start: data[1], count: frames))
                    : left
            }
            return (left, right, srcRate)
        }
        if let data = buffer.int16ChannelData {
            let scale: Float = 1.0 / 32768.0
            if buffer.format.isInterleaved {
                for i in 0..<frames {
                    left[i] = Float(data[0][i * channels]) * scale
                    right[i] = channels > 1 ? Float(data[0][i * channels + 1]) * scale : left[i]
                }
            } else {
                for i in 0..<frames {
                    left[i] = Float(data[0][i]) * scale
                    right[i] = channels > 1 ? Float(data[1][i]) * scale : left[i]
                }
            }
            return (left, right, srcRate)
        }
        return ([], [], 0)
    }

    private static func resampleArrays(
        left: [Float],
        right: [Float],
        srcRate: Double,
        destRate: Double
    ) -> ([Float], [Float]) {
        let srcFrames = min(left.count, right.count)
        guard srcFrames > 1, srcRate > 1, destRate > 1 else { return ([], []) }
        if abs(srcRate - destRate) < 0.5 {
            return (Array(left.prefix(srcFrames)), Array(right.prefix(srcFrames)))
        }
        let destFrames = max(1, Int((Double(srcFrames) * destRate / srcRate).rounded()))
        var outL = [Float](repeating: 0, count: destFrames)
        var outR = [Float](repeating: 0, count: destFrames)
        let ratio = srcRate / destRate
        let last = srcFrames - 1
        for i in 0..<destFrames {
            let pos = Double(i) * ratio
            let i0 = min(Int(pos), last)
            let i1 = min(i0 + 1, last)
            let frac = Float(pos - Double(i0))
            outL[i] = left[i0] + (left[i1] - left[i0]) * frac
            outR[i] = right[i0] + (right[i1] - right[i0]) * frac
        }
        return (outL, outR)
    }

    private func startFileLoop(restart: Bool) {
        guard let player = fileLoopPlayer, let buffer = fileLoopBuffer, buffer.frameLength > 1 else { return }
        player.volume = fileLoopGain
        if !restart && player.isPlaying && !fileLoopStopAtEnd {
            return
        }
        fileLoopStopAtEnd = false
        fileLoopPlaying = true
        player.stop()
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
    }

    private func stopFileLoopAtCycleEnd() {
        guard let player = fileLoopPlayer, player.isPlaying else {
            fileLoopPlaying = false
            fileLoopStopAtEnd = false
            return
        }
        guard
            let format = fileLoopBuffer?.format,
            let silent = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 64)
        else {
            player.stop()
            fileLoopPlaying = false
            return
        }
        silent.frameLength = 64
        fileLoopStopAtEnd = true
        player.scheduleBuffer(silent, at: nil, options: [.interruptsAtLoop]) { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.fileLoopStopAtEnd else { return }
                self.fileLoopPlayer?.stop()
                self.fileLoopPlaying = false
                self.fileLoopStopAtEnd = false
                Self.publishNowPlaying(playing: self.isAudible)
            }
        }
    }

    private func startLoopingMetro(bpm: Double, rebuild: Bool) {
        guard let player = clickPlayer else { return }
        if rebuild || metroLoopBuffer == nil || abs(metroLoopBpm - bpm) > 0.2 {
            rebuildLoopBuffer(bpm: bpm)
        }
        guard let buffer = metroLoopBuffer else { return }
        player.stop()
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
    }

    private func rebuildLoopBuffer(bpm: Double) {
        let sr = max(1000, clickFormat?.sampleRate ?? sampleRate)
        guard
            let format = clickFormat ?? AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2),
            format.channelCount >= 1
        else { return }
        let channelCount = Int(format.channelCount)
        let periodFrames = AVAudioFrameCount(max(256, Int(format.sampleRate * 60.0 / max(30, bpm))))
        let clickFrames = min(Int(periodFrames), max(64, Int(0.05 * format.sampleRate)))
        guard
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: periodFrames),
            let channels = buffer.floatChannelData
        else {
            NSLog("DroneSynth metro buffer failed sr=%.0f ch=%d", format.sampleRate, channelCount)
            return
        }
        buffer.frameLength = periodFrames
        let rate = Float(format.sampleRate)
        for i in 0..<Int(periodFrames) {
            var sample: Float = 0
            if i < clickFrames {
                let env = powf(1 - Float(i) / Float(max(1, clickFrames)), 1.8)
                sample = sinf(2 * Float.pi * 1240 * Float(i) / rate) * env
            }
            for ch in 0..<channelCount {
                channels[ch][i] = sample
            }
        }
        metroLoopBuffer = buffer
        metroLoopBpm = bpm
    }

    private func render(frameCount: Int, audioBufferList: UnsafeMutablePointer<AudioBufferList>) {
        let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
        guard frameCount > 0, let first = buffers.first, let data = first.mData else { return }
        let left = data.assumingMemoryBound(to: Float.self)
        let planarRight: UnsafeMutablePointer<Float>? = buffers.count > 1
            ? buffers[1].mData?.assumingMemoryBound(to: Float.self)
            : nil

        lock.lock()
        defer { lock.unlock() }

        let sr = sampleRate
        guard sr > 1000 else { return }
        let invSr = 1.0 / sr
        let gainSmooth = 1.0 - exp(-1.0 / (0.02 * sr))
        let panSmooth = 1.0 - exp(-1.0 / (0.08 * sr))
        let attackCoeff = 1.0 - exp(-1.0 / (0.002 * sr))
        let releaseCoeff = 1.0 - exp(-1.0 / (0.05 * sr))
        let oscLimit = min(liveOsc, oscs.count)
        let nyquist = sr * 0.49
        let floatsInFirst = Int(first.mDataByteSize) / MemoryLayout<Float>.stride
        let usePlanar = planarRight != nil
        let useInterleaved = !usePlanar && floatsInFirst >= frameCount * 2

        for frame in 0..<frameCount {
            if masterInc != 0 {
                master += masterInc
                if (masterInc > 0 && master >= masterTarget) || (masterInc < 0 && master <= masterTarget) {
                    master = masterTarget
                    masterInc = 0
                }
            }
            if outputFadeInc != 0 {
                outputFade += outputFadeInc
                if (outputFadeInc > 0 && outputFade >= outputFadeTarget)
                    || (outputFadeInc < 0 && outputFade <= outputFadeTarget) {
                    outputFade = outputFadeTarget
                    outputFadeInc = 0
                }
            }

            var mixL = 0.0
            var mixR = 0.0
            var shineL = 0.0
            var shineR = 0.0
            var clickL = 0.0
            var clickR = 0.0
            for i in 0..<oscLimit where oscs[i].active {
                if oscs[i].freqInc != 0 {
                    oscs[i].freq += oscs[i].freqInc
                    if (oscs[i].freqInc > 0 && oscs[i].freq >= oscs[i].freqTarget)
                        || (oscs[i].freqInc < 0 && oscs[i].freq <= oscs[i].freqTarget) {
                        oscs[i].freq = oscs[i].freqTarget
                        oscs[i].freqInc = 0
                    }
                }
                if oscs[i].gainInc != 0 {
                    oscs[i].gain += oscs[i].gainInc
                    if (oscs[i].gainInc > 0 && oscs[i].gain >= oscs[i].gainTarget)
                        || (oscs[i].gainInc < 0 && oscs[i].gain <= oscs[i].gainTarget) {
                        oscs[i].gain = oscs[i].gainTarget
                        oscs[i].gainInc = 0
                        if oscs[i].releasing {
                            oscs[i].active = false
                            continue
                        }
                    }
                } else {
                    oscs[i].gain += (oscs[i].gainTarget - oscs[i].gain) * gainSmooth
                    if oscs[i].releasing && oscs[i].gain < 0.00005 {
                        oscs[i].active = false
                        continue
                    }
                }
                oscs[i].pan += (oscs[i].panTarget - oscs[i].pan) * panSmooth
                if oscs[i].freq >= nyquist { continue }
                let dt = oscs[i].freq * invSr
                oscs[i].phase = wrap01(oscs[i].phase + dt)
                let sample = waveform(oscs[i].wave, phase: oscs[i].phase, freq: oscs[i].freq, tableId: oscs[i].tableId) * oscs[i].gain
                let pan = oscs[i].pan
                mixL += sample * sqrt((1 - pan) * 0.5)
                mixR += sample * sqrt((1 + pan) * 0.5)
            }

            for i in shine.indices where shine[i].active || shine[i].gainTarget > 0.0002 {
                shine[i].gain += (shine[i].gainTarget - shine[i].gain) * gainSmooth
                shine[i].pan += (shine[i].panTarget - shine[i].pan) * panSmooth
                if shine[i].gain < 0.0002 && shine[i].gainTarget <= 0.0002 {
                    shine[i].active = false
                    continue
                }
                shine[i].active = true
                if shine[i].freq >= nyquist { continue }
                let dt = shine[i].freq * invSr
                shine[i].phase = wrap01(shine[i].phase + dt)
                let sample = sin(shine[i].phase * twoPi) * shine[i].gain
                let pan = shine[i].pan
                shineL += sample * sqrt((1 - pan) * 0.5)
                shineR += sample * sqrt((1 + pan) * 0.5)
            }

            for i in clicks.indices where clicks[i].active {
                let elapsed = clicks[i].total - clicks[i].remaining
                if elapsed < clicks[i].attackSamples {
                    let t = Double(elapsed) / Double(max(1, clicks[i].attackSamples))
                    clicks[i].amp = 0.0001 + (clicks[i].peak - 0.0001) * t
                } else {
                    clicks[i].amp += (0 - clicks[i].amp) * clicks[i].decayCoeff
                }
                clicks[i].phase = wrap01(clicks[i].phase + clicks[i].freq * invSr)
                let square = clicks[i].phase < 0.5 ? 1.0 : -1.0
                let sample = square * clicks[i].amp
                clickL += sample
                clickR += sample
                clicks[i].remaining -= 1
                if clicks[i].remaining <= 0 || clicks[i].amp < 0.0002 {
                    clicks[i].active = false
                }
            }

            var leftSample = (mixL * master + shineL) * mixGain * outputFade
            var rightSample = (mixR * master + shineR) * mixGain * outputFade
            let peak = max(abs(leftSample), abs(rightSample))
            if peak > limiterEnv {
                limiterEnv += (peak - limiterEnv) * attackCoeff
            } else {
                limiterEnv += (peak - limiterEnv) * releaseCoeff
            }
            if limiterEnv > Self.limiterThreshold {
                let gain = Self.limiterThreshold / limiterEnv
                leftSample *= gain
                rightSample *= gain
            }
            leftSample = max(-1, min(1, leftSample + clickL))
            rightSample = max(-1, min(1, rightSample + clickR))
            let outL = Float(max(-1, min(1, leftSample)))
            let outR = Float(max(-1, min(1, rightSample)))
            if usePlanar, let right = planarRight {
                left[frame] = outL
                right[frame] = outR
            } else if useInterleaved {
                left[frame * 2] = outL
                left[frame * 2 + 1] = outR
            } else {
                left[frame] = (outL + outR) * 0.5
            }
        }
    }

    private func wrap01(_ value: Double) -> Double {
        var phase = value
        if phase >= 1 { phase -= floor(phase) }
        if phase < 0 { phase += 1 }
        return phase
    }

    /// 0 = sine, 1 = saw, 2 = square, 3 = sample wavetable.
    private func waveform(_ wave: Int, phase: Double, freq: Double, tableId: String) -> Double {
        switch wave {
        case 1:
            return waves.sample(isSquare: false, phase: phase, freq: freq, sampleRate: sampleRate)
        case 2:
            return waves.sample(isSquare: true, phase: phase, freq: freq, sampleRate: sampleRate)
        case 3:
            return customWaves[tableId]?.sample(phase: phase, freq: freq, sampleRate: sampleRate)
                ?? sin(phase * twoPi)
        default:
            return sin(phase * twoPi)
        }
    }

    private static var cachedArtwork: MPMediaItemArtwork?
    private static var cachedArtworkKey = ""

    private static func roundedFont(size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.rounded) else {
            return base
        }
        return UIFont(descriptor: descriptor, size: size)
    }

    private static func fittedFont(
        for text: String,
        width: CGFloat,
        maxHeight: CGFloat,
        maxSize: CGFloat,
        minSize: CGFloat,
        maxLines: Int,
        weight: UIFont.Weight
    ) -> UIFont {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineBreakMode = .byWordWrapping
        var size = maxSize
        while size > minSize {
            let font = roundedFont(size: size, weight: weight)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .paragraphStyle: paragraph,
            ]
            let bound = (text as NSString).boundingRect(
                with: CGSize(width: width, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: attrs,
                context: nil
            )
            let lines = Int(ceil(bound.height / max(font.lineHeight, 1)))
            if bound.height <= maxHeight && lines <= maxLines {
                return font
            }
            size -= 4
        }
        return roundedFont(size: minSize, weight: weight)
    }

    private static func windowedSequence(
        _ sequence: [String],
        activeIndex: Int,
        maxRows: Int
    ) -> (items: [String], active: Int, start: Int) {
        if sequence.count <= maxRows {
            return (sequence, activeIndex, 0)
        }
        var start = max(0, activeIndex - maxRows / 2)
        let end = min(sequence.count, start + maxRows)
        start = max(0, end - maxRows)
        return (Array(sequence[start..<end]), activeIndex - start, start)
    }

    private static func drawPresetSequenceTable(
        sequence: [String],
        activeIndex: Int,
        in rect: CGRect
    ) {
        guard sequence.count >= 2, rect.height >= 40, rect.width >= 80 else {
            return
        }
        let gap: CGFloat = 9
        let rowH: CGFloat = 72
        let maxFit = min(6, max(2, Int(floor((rect.height + gap) / (rowH + gap)))))
        let window = windowedSequence(sequence, activeIndex: activeIndex, maxRows: maxFit)
        var y = rect.minY

        let numberWidth: CGFloat = 68
        let nameInset: CGFloat = 12
        let nameParagraph = NSMutableParagraphStyle()
        nameParagraph.alignment = .left
        nameParagraph.lineBreakMode = .byTruncatingTail
        let numberParagraph = NSMutableParagraphStyle()
        numberParagraph.alignment = .center

        for (offset, name) in window.items.enumerated() {
            let row = CGRect(x: rect.minX, y: y, width: rect.width, height: rowH)
            let isActive = offset == window.active
            let fill = isActive
                ? UIColor(red: 251 / 255, green: 191 / 255, blue: 36 / 255, alpha: 0.22)
                : UIColor(white: 1, alpha: 0.07)
            let stroke = isActive
                ? UIColor(red: 252 / 255, green: 211 / 255, blue: 77 / 255, alpha: 0.9)
                : UIColor(white: 1, alpha: 0.12)
            let path = UIBezierPath(roundedRect: row, cornerRadius: 12)
            fill.setFill()
            path.fill()
            stroke.setStroke()
            path.lineWidth = isActive ? 2 : 1
            path.stroke()

            let fontSize: CGFloat = 44
            let font = roundedFont(size: fontSize, weight: isActive ? .bold : .semibold)
            let number = "\(window.start + offset + 1)" as NSString
            let nameText = name as NSString
            let numberAttrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: isActive
                    ? UIColor(red: 253 / 255, green: 230 / 255, blue: 138 / 255, alpha: 1)
                    : UIColor(white: 1, alpha: 0.45),
                .paragraphStyle: numberParagraph,
            ]
            let nameAttrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: isActive ? UIColor.white : UIColor(white: 1, alpha: 0.78),
                .paragraphStyle: nameParagraph,
            ]
            let textHeight = font.lineHeight
            let textY = row.midY - textHeight / 2
            number.draw(
                in: CGRect(x: row.minX, y: textY, width: numberWidth, height: textHeight + 6),
                withAttributes: numberAttrs
            )
            var nameX = row.minX + numberWidth
            let isTransportRow = name.compare("Play / Pause", options: .caseInsensitive) == .orderedSame
            if isTransportRow {
                let tint = isActive ? UIColor.white : UIColor(white: 1, alpha: 0.78)
                let config = UIImage.SymbolConfiguration(pointSize: 46, weight: .semibold)
                let symbolNames = ["pause.fill", "play.fill"]
                var symbolX = nameX
                for symbolName in symbolNames {
                    if let symbol = UIImage(systemName: symbolName, withConfiguration: config)?
                        .withTintColor(tint, renderingMode: .alwaysOriginal)
                    {
                        let size = symbol.size
                        let symbolRect = CGRect(
                            x: symbolX,
                            y: row.midY - size.height / 2,
                            width: size.width,
                            height: size.height
                        )
                        symbol.draw(in: symbolRect)
                        symbolX = symbolRect.maxX + 4
                    }
                }
                nameX = symbolX + 8
            }
            nameText.draw(
                in: CGRect(
                    x: nameX,
                    y: textY,
                    width: max(40, row.maxX - nameX - nameInset),
                    height: textHeight + 6
                ),
                withAttributes: nameAttrs
            )
            y += rowH + gap
        }
    }

    private static func renderNowPlayingImage(
        title: String,
        artist: String,
        playing: Bool,
        sequence: [String],
        activeIndex: Int
    ) -> UIImage {
        let canvas = CGSize(width: 1024, height: 1024)
        let renderer = UIGraphicsImageRenderer(size: canvas)
        let isTransport = title.compare("Play / Pause", options: .caseInsensitive) == .orderedSame
        let showTable = sequence.count >= 2
        return renderer.image { rendererContext in
            let bounds = CGRect(origin: .zero, size: canvas)
            UIColor(red: 17 / 255, green: 16 / 255, blue: 25 / 255, alpha: 1).setFill()
            rendererContext.fill(bounds)

            let inset: CGFloat = 56
            let textWidth = canvas.width - inset * 2
            let titleGap: CGFloat = 88
            let bottomPad: CGFloat = 48
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            paragraph.lineBreakMode = .byWordWrapping

            let titleMaxHeight: CGFloat = showTable ? 280 : 320
            let titleMaxSize: CGFloat = 200
            var afterPreset = titleGap
            if isTransport {
                let symbolSize: CGFloat = 200
                let symbolName = playing ? "pause.fill" : "play.fill"
                let config = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .bold)
                if let symbol = UIImage(systemName: symbolName, withConfiguration: config)?
                    .withTintColor(.white, renderingMode: .alwaysOriginal)
                {
                    let size = symbol.size
                    let drawRect = CGRect(
                        x: (canvas.width - size.width) / 2,
                        y: titleGap,
                        width: size.width,
                        height: size.height
                    )
                    symbol.draw(in: drawRect)
                    afterPreset = drawRect.maxY + titleGap
                }
            } else {
                let titleFont = fittedFont(
                    for: title,
                    width: textWidth,
                    maxHeight: titleMaxHeight,
                    maxSize: titleMaxSize,
                    minSize: 52,
                    maxLines: 3,
                    weight: .bold
                )
                let titleAttrs: [NSAttributedString.Key: Any] = [
                    .font: titleFont,
                    .foregroundColor: UIColor.white,
                    .paragraphStyle: paragraph,
                ]
                let titleBound = (title as NSString).boundingRect(
                    with: CGSize(width: textWidth, height: titleMaxHeight),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: titleAttrs,
                    context: nil
                )
                (title as NSString).draw(
                    in: CGRect(
                        x: inset,
                        y: titleGap,
                        width: textWidth,
                        height: ceil(titleBound.height) + 12
                    ),
                    withAttributes: titleAttrs
                )
                afterPreset = titleGap + titleBound.height + titleGap
            }

            let artistReserve: CGFloat = showTable ? 108 : max(80, canvas.height - afterPreset - bottomPad)
            let artistRect = CGRect(
                x: inset,
                y: canvas.height - bottomPad - artistReserve,
                width: textWidth,
                height: artistReserve
            )
            if showTable {
                let tableRect = CGRect(
                    x: inset,
                    y: afterPreset,
                    width: textWidth,
                    height: max(40, artistRect.minY - afterPreset - 20)
                )
                drawPresetSequenceTable(
                    sequence: sequence,
                    activeIndex: activeIndex,
                    in: tableRect
                )
            }

            let artistFont = fittedFont(
                for: artist,
                width: textWidth,
                maxHeight: artistRect.height,
                maxSize: showTable ? 64 : 118,
                minSize: 32,
                maxLines: 2,
                weight: .semibold
            )
            let artistAttrs: [NSAttributedString.Key: Any] = [
                .font: artistFont,
                .foregroundColor: UIColor(white: 0.78, alpha: 1),
                .paragraphStyle: paragraph,
            ]
            let artistBound = (artist as NSString).boundingRect(
                with: CGSize(width: textWidth, height: artistRect.height),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: artistAttrs,
                context: nil
            )
            (artist as NSString).draw(
                in: CGRect(
                    x: inset,
                    y: artistRect.minY + max(0, (artistRect.height - artistBound.height) / 2),
                    width: textWidth,
                    height: ceil(artistBound.height) + 12
                ),
                withAttributes: artistAttrs
            )
        }
    }

    private static func nowPlayingArtwork(
        title: String,
        artist: String,
        playing: Bool,
        sequence: [String],
        activeIndex: Int
    ) -> MPMediaItemArtwork {
        let isTransport = title.compare("Play / Pause", options: .caseInsensitive) == .orderedSame
        let sequenceKey = sequence.joined(separator: "\u{1f}")
        let key = "\(title)\u{0}\(artist)\u{0}\(isTransport && playing ? "1" : "0")\u{0}\(sequenceKey)\u{0}\(activeIndex)"
        if key == cachedArtworkKey, let cached = cachedArtwork {
            return cached
        }
        let image = renderNowPlayingImage(
            title: title,
            artist: artist,
            playing: playing,
            sequence: sequence,
            activeIndex: activeIndex
        )
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        cachedArtwork = artwork
        cachedArtworkKey = key
        return artwork
    }

    private static func publishNowPlaying(playing: Bool) {
        let title = shared.nowPlayingTitle
        let artist = shared.nowPlayingArtist
        let sequence = shared.nowPlayingSequence
        let activeIndex = shared.nowPlayingActiveIndex
        DispatchQueue.main.async {
            let center = MPRemoteCommandCenter.shared()
            center.playCommand.isEnabled = playing
            center.pauseCommand.isEnabled = playing
            center.togglePlayPauseCommand.isEnabled = playing
            center.nextTrackCommand.isEnabled = playing
            center.previousTrackCommand.isEnabled = playing
            if !playing {
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
                UIApplication.shared.endReceivingRemoteControlEvents()
                return
            }
            UIApplication.shared.beginReceivingRemoteControlEvents()
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPMediaItemPropertyTitle: "Drone",
                MPMediaItemPropertyArtwork: nowPlayingArtwork(
                    title: title,
                    artist: artist,
                    playing: playing,
                    sequence: sequence,
                    activeIndex: activeIndex
                ),
                MPNowPlayingInfoPropertyPlaybackRate: 1.0,
                MPNowPlayingInfoPropertyIsLiveStream: true,
            ]
        }
    }
}
