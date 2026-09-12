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
    }

    private struct Osc {
        var id = ""
        var wave = 0
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

    private var oscs = Array(repeating: Osc(), count: 384)
    private var shine = Array(repeating: Shine(), count: 16)
    private var clicks = Array(repeating: Click(), count: 4)
    private var liveOsc = 0
    private var master = 0.0001
    private var masterTarget = 0.0001
    private var masterInc = 0.0
    private var lpL = Biquad()
    private var lpR = Biquad()
    private var limiterEnv = 0.0
    private var heldMaster = 0.3
    private var mixGain = 1.0
    private var storedFadeIn = 0.0
    private var storedFadeOut = 0.0
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
    private let twoPi = 2.0 * Double.pi

    /// Prefer ~23 ms I/O. Never bounce the session while playing.
    private static let ioBufferDuration: TimeInterval = 0.023
    private static let lowpassHz = 6500.0
    private static let limiterThreshold = pow(10.0, -1.0 / 20.0)

    private struct Biquad {
        var b0 = 1.0
        var b1 = 0.0
        var b2 = 0.0
        var a1 = 0.0
        var a2 = 0.0
        var z1 = 0.0
        var z2 = 0.0

        mutating func setLowpass(freq: Double, q: Double, sampleRate: Double) {
            let nyquist = sampleRate * 0.45
            let cutoff = min(max(10, freq), nyquist)
            let w0 = 2.0 * Double.pi * cutoff / sampleRate
            let cosw = cos(w0)
            let alpha = sin(w0) / (2 * max(0.1, q))
            let b0t = (1 - cosw) / 2
            let b1t = 1 - cosw
            let b2t = (1 - cosw) / 2
            let a0 = 1 + alpha
            b0 = b0t / a0
            b1 = b1t / a0
            b2 = b2t / a0
            a1 = (-2 * cosw) / a0
            a2 = (1 - alpha) / a0
            z1 = 0
            z2 = 0
        }

        mutating func process(_ x: Double) -> Double {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }

        mutating func reset() {
            z1 = 0
            z2 = 0
        }
    }

    private init() {}

    func applyPlaybackSession() throws {
        let session = AVAudioSession.sharedInstance()
        if session.category != .playback || !session.categoryOptions.isEmpty {
            try session.setCategory(.playback, mode: .default, options: [])
        }
        try session.setPreferredIOBufferDuration(Self.ioBufferDuration)
        try session.setActive(true, options: [])
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
        metroEnabled = false
        limiterEnv = 0
        lpL.reset()
        lpR.reset()
        lock.unlock()
        clickPlayer?.stop()
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
        let live = (0..<min(liveOsc, oscs.count)).contains { oscs[$0].active && oscs[$0].gain > 0.00005 }
        let shimmer = shine.contains { $0.active && $0.gain > 0.0002 }
        return mixGain > 0.5 && ((master > 0.01 && live) || shimmer)
    }

    func resumeAfterRemote() {
        onScreen = true
        mixGain = 1
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
        let sr = sampleRate
        let dest = max(0.0001, target)
        lock.lock()
        if dest > 0.01 {
            heldMaster = dest
            mixGain = 1
        }
        if seconds <= 0.001 {
            master = dest
            masterTarget = dest
            masterInc = 0
        } else {
            masterTarget = dest
            masterInc = (dest - master) / (seconds * sr)
        }
        lock.unlock()
        Self.publishNowPlaying(playing: dest > 0.01)
    }

    func setGraph(master: Double, fadeSeconds: Double, fadeInSeconds: Double, fadeOutSeconds: Double, oscillators: [OscSpec]) {
        onScreen = true
        storedFadeIn = max(0, fadeInSeconds)
        storedFadeOut = max(0, fadeOutSeconds)
        do {
            try startIfNeeded()
        } catch {
            NSLog("DroneSynth start failed: \(error.localizedDescription)")
        }
        let sr = sampleRate
        lock.lock()
        let snapshot = Array(oscs.prefix(liveOsc))
        let currentMaster = self.master
        lock.unlock()

        let hasLive = snapshot.contains { $0.active && $0.gain > 0.00005 }
        let audible = currentMaster > 0.01 && hasLive
        let fromSilence = fadeSeconds > 0.001 && !hasLive
        let overlap = fadeSeconds > 0.025 && audible
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
            } else {
                self.master = currentMaster
                masterTarget = 0.0001
                masterInc = (0.0001 - self.master) / (fadeSeconds * sr)
            }
            lock.unlock()
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
        }
        lock.unlock()
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
        }
        lock.unlock()
    }

    func setMetronome(enabled: Bool, bpm: Double, volumeDb: Double, muted: Bool) {
        onScreen = true
        let tempo = min(350, max(30, bpm))
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

    func click(frequency: Double, peak: Double) {
        onScreen = true
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
        guard onScreen else { return }
        try prepare()
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
            var runningRate = source?.outputFormat(forBus: 0).sampleRate ?? 0
            if runningRate < 1000 {
                runningRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
            }
            if runningRate >= 1000, abs(runningRate - sampleRate) > 0.5 {
                sampleRate = runningRate
                lpL.setLowpass(freq: Self.lowpassHz, q: 0.7, sampleRate: runningRate)
                lpR.setLowpass(freq: Self.lowpassHz, q: 0.7, sampleRate: runningRate)
            }
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
        lpL.setLowpass(freq: Self.lowpassHz, q: 0.7, sampleRate: hwRate)
        lpR.setLowpass(freq: Self.lowpassHz, q: 0.7, sampleRate: hwRate)
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
                let sample = sin(oscs[i].phase * twoPi) * oscs[i].gain
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

            var leftSample = lpL.process(mixL * master + shineL) * mixGain
            var rightSample = lpR.process(mixR * master + shineR) * mixGain
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
        let gap: CGFloat = 6
        let rowH: CGFloat = 48
        let maxFit = max(2, Int(floor((rect.height + gap) / (rowH + gap))))
        let window = windowedSequence(sequence, activeIndex: activeIndex, maxRows: maxFit)
        var y = rect.minY

        let numberWidth: CGFloat = 40
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
            let path = UIBezierPath(roundedRect: row, cornerRadius: 8)
            fill.setFill()
            path.fill()
            stroke.setStroke()
            path.lineWidth = isActive ? 2 : 1
            path.stroke()

            let fontSize: CGFloat = 26
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
                let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
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

            let iconSize: CGFloat = 112
            let iconTop: CGFloat = 56
            let iconBottom = iconTop + iconSize
            if let icon = UIImage(named: "NowPlaying") {
                let iconRect = CGRect(
                    x: (canvas.width - iconSize) / 2,
                    y: iconTop,
                    width: iconSize,
                    height: iconSize
                )
                rendererContext.cgContext.saveGState()
                UIBezierPath(roundedRect: iconRect, cornerRadius: 26).addClip()
                icon.draw(in: iconRect)
                rendererContext.cgContext.restoreGState()
            }

            let inset: CGFloat = 56
            let textWidth = canvas.width - inset * 2
            let afterIcon: CGFloat = iconBottom + 36
            let bottomPad: CGFloat = 48
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            paragraph.lineBreakMode = .byWordWrapping

            let titleMaxHeight: CGFloat = 280
            let titleMaxSize: CGFloat = 200
            var afterPreset = afterIcon
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
                        y: afterIcon,
                        width: size.width,
                        height: size.height
                    )
                    symbol.draw(in: drawRect)
                    afterPreset = drawRect.maxY + 24
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
                        y: afterIcon,
                        width: textWidth,
                        height: ceil(titleBound.height) + 12
                    ),
                    withAttributes: titleAttrs
                )
                afterPreset = afterIcon + titleBound.height + 24
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
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPMediaItemPropertyTitle: "Drone",
                MPMediaItemPropertyArtwork: nowPlayingArtwork(
                    title: title,
                    artist: artist,
                    playing: playing,
                    sequence: sequence,
                    activeIndex: activeIndex
                ),
                MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
                MPNowPlayingInfoPropertyIsLiveStream: true,
            ]
        }
    }
}
