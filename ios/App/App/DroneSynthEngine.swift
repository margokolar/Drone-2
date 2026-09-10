import AVFoundation
import Foundation

/// Continuous drone mixer so WKWebView never owns the audio session.
final class DroneSynthEngine {
    static let shared = DroneSynthEngine()

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private let lock = NSLock()
    private var sampleRate = 48_000.0
    private var prepared = false
    private var onScreen = true
    private let twoPi = 2.0 * Double.pi

    private struct Osc {
        var id = ""
        var wave = 0
        var phase = 0.0
        var freq = 440.0
        var freqTarget = 440.0
        var freqInc = 0.0
        var gain = 0.0
        var gainTarget = 0.0
        var pan = 0.0
        var panTarget = 0.0
        var active = false
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
    private var master = 0.0001
    private var masterTarget = 0.0001
    private var masterInc = 0.0
    private var lpLeft = 0.0
    private var lpRight = 0.0
    private var lpAlpha = 0.4

    private init() {}

    func park() {
        onScreen = false
        if engine.isRunning {
            engine.stop()
        }
        lock.lock()
        for i in oscs.indices { oscs[i].active = false }
        for i in shine.indices { shine[i].active = false }
        for i in clicks.indices { clicks[i].active = false }
        master = 0.0001
        masterTarget = 0.0001
        masterInc = 0
        lpLeft = 0
        lpRight = 0
        lock.unlock()
    }

    func reclaim() throws {
        onScreen = true
        try startIfNeeded()
    }

    func mute() {
        lock.lock()
        master = 0.0001
        masterTarget = 0.0001
        masterInc = 0
        lock.unlock()
    }

    func fadeMaster(to target: Double, seconds: Double) {
        let sr = sampleRate
        let dest = max(0.0001, target)
        lock.lock()
        if seconds <= 0.001 {
            master = dest
            masterTarget = dest
            masterInc = 0
        } else {
            masterTarget = dest
            masterInc = (dest - master) / (seconds * sr)
        }
        lock.unlock()
    }

    func setGraph(master: Double, fadeSeconds: Double, oscillators: [[String: Any]]) {
        guard onScreen else { return }
        try? startIfNeeded()
        let sr = sampleRate
        let incoming = oscillators.compactMap(Self.parseOsc)
        lock.lock()
        fadeMasterLocked(to: max(0.0001, master), seconds: fadeSeconds, sr: sr)

        var seen = Set<String>()
        for spec in incoming {
            seen.insert(spec.id)
            if let index = oscs.firstIndex(where: { $0.active && $0.id == spec.id }) {
                oscs[index].wave = spec.wave
                oscs[index].freqTarget = spec.freq
                if spec.glideSeconds > 0, spec.glideFrom > 0 {
                    oscs[index].freq = spec.glideFrom
                    oscs[index].freqInc = (spec.freq - spec.glideFrom) / (spec.glideSeconds * sr)
                } else {
                    oscs[index].freqInc = (spec.freq - oscs[index].freq) / (0.03 * sr)
                }
                oscs[index].gainTarget = spec.gain
                oscs[index].panTarget = spec.pan
            } else if let index = oscs.firstIndex(where: { !$0.active }) {
                oscs[index].id = spec.id
                oscs[index].wave = spec.wave
                oscs[index].phase = 0
                if spec.glideSeconds > 0, spec.glideFrom > 0 {
                    oscs[index].freq = spec.glideFrom
                    oscs[index].freqInc = (spec.freq - spec.glideFrom) / (spec.glideSeconds * sr)
                } else {
                    oscs[index].freq = spec.freq
                    oscs[index].freqInc = 0
                }
                oscs[index].freqTarget = spec.freq
                oscs[index].gain = 0
                oscs[index].gainTarget = spec.gain
                oscs[index].pan = spec.pan
                oscs[index].panTarget = spec.pan
                oscs[index].active = true
            }
        }
        for i in oscs.indices where oscs[i].active && !seen.contains(oscs[i].id) {
            oscs[i].gainTarget = 0
            oscs[i].freqInc = 0
        }
        lock.unlock()
    }

    func setShine(items: [[String: Any]]) {
        lock.lock()
        for i in shine.indices {
            if i < items.count {
                let item = items[i]
                let freq = Self.num(item, "freq")
                let gain = Self.num(item, "gain")
                let pan = Self.num(item, "pan")
                shine[i].freq = max(1, freq)
                shine[i].gainTarget = max(0, gain)
                shine[i].panTarget = max(-1, min(1, pan))
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

    func click(frequency: Double, peak: Double) {
        guard onScreen, peak > 0.0001 else { return }
        try? startIfNeeded()
        let sr = sampleRate
        lock.lock()
        if let index = clicks.firstIndex(where: { !$0.active }) {
            clicks[index].freq = frequency
            clicks[index].phase = 0
            clicks[index].amp = 0.0001
            clicks[index].peak = max(0, min(1, peak))
            clicks[index].attackSamples = max(1, Int(0.001 * sr))
            clicks[index].total = max(clicks[index].attackSamples + 1, Int(0.055 * sr))
            clicks[index].remaining = clicks[index].total
            clicks[index].decayCoeff = 1.0 - exp(-1.0 / (0.012 * sr))
            clicks[index].active = true
        }
        lock.unlock()
    }

    private struct OscSpec {
        var id: String
        var wave: Int
        var freq: Double
        var gain: Double
        var pan: Double
        var glideFrom: Double
        var glideSeconds: Double
    }

    private static func num(_ raw: [String: Any], _ key: String) -> Double {
        if let value = raw[key] as? Double { return value }
        if let value = raw[key] as? NSNumber { return value.doubleValue }
        if let value = raw[key] as? Int { return Double(value) }
        return 0
    }

    private static func parseOsc(_ raw: [String: Any]) -> OscSpec? {
        guard let id = raw["id"] as? String else { return nil }
        return OscSpec(
            id: id,
            wave: Int(num(raw, "wave")),
            freq: max(1, num(raw, "freq")),
            gain: max(0, num(raw, "gain")),
            pan: max(-1, min(1, num(raw, "pan"))),
            glideFrom: num(raw, "glideFrom"),
            glideSeconds: num(raw, "glideSeconds")
        )
    }

    private func fadeMasterLocked(to target: Double, seconds: Double, sr: Double) {
        if seconds <= 0.001 {
            master = target
            masterTarget = target
            masterInc = 0
        } else {
            masterTarget = target
            masterInc = (target - master) / (seconds * sr)
        }
    }

    private func startIfNeeded() throws {
        guard onScreen else { return }
        try prepare()
        if !engine.isRunning {
            try engine.start()
        }
    }

    private func prepare() throws {
        if prepared { return }
        let session = AVAudioSession.sharedInstance()
        if session.category != .playback || !session.categoryOptions.isEmpty {
            try session.setCategory(.playback, mode: .default, options: [])
        }
        try session.setActive(true, options: [])
        var hwRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        if hwRate < 1000 {
            hwRate = session.sampleRate > 0 ? session.sampleRate : 48_000
        }
        sampleRate = hwRate
        lpAlpha = {
            let rc = 1.0 / (2.0 * Double.pi * 6500)
            let dt = 1.0 / hwRate
            return dt / (rc + dt)
        }()
        guard let format = AVAudioFormat(standardFormatWithSampleRate: hwRate, channels: 2) else {
            throw NSError(domain: "DroneSynthEngine", code: 1)
        }
        let node = AVAudioSourceNode(format: format) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            self?.render(frameCount: Int(frameCount), audioBufferList: audioBufferList)
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.connect(engine.mainMixerNode, to: engine.outputNode, format: nil)
        engine.mainMixerNode.outputVolume = 1
        source = node
        prepared = true
    }

    private func render(frameCount: Int, audioBufferList: UnsafeMutablePointer<AudioBufferList>) {
        let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
        guard frameCount > 0, let first = buffers.first, let data = first.mData else { return }
        let left = data.assumingMemoryBound(to: Float.self)
        let right: UnsafeMutablePointer<Float> = buffers.count > 1
            ? (buffers[1].mData?.assumingMemoryBound(to: Float.self) ?? left)
            : left

        lock.lock()
        defer { lock.unlock() }

        let sr = sampleRate
        let twoPi = self.twoPi
        let gainSmooth = 1.0 - exp(-1.0 / (0.02 * sr))
        let panSmooth = 1.0 - exp(-1.0 / (0.08 * sr))
        let alpha = lpAlpha

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

            for i in oscs.indices where oscs[i].active {
                if oscs[i].freqInc != 0 {
                    oscs[i].freq += oscs[i].freqInc
                    if (oscs[i].freqInc > 0 && oscs[i].freq >= oscs[i].freqTarget)
                        || (oscs[i].freqInc < 0 && oscs[i].freq <= oscs[i].freqTarget) {
                        oscs[i].freq = oscs[i].freqTarget
                        oscs[i].freqInc = 0
                    }
                }
                oscs[i].gain += (oscs[i].gainTarget - oscs[i].gain) * gainSmooth
                oscs[i].pan += (oscs[i].panTarget - oscs[i].pan) * panSmooth
                if oscs[i].gainTarget <= 0.0002 && oscs[i].gain < 0.00025 {
                    oscs[i].active = false
                    continue
                }
                oscs[i].phase = wrap01(oscs[i].phase + oscs[i].freq / sr)
                let sample = waveform(oscs[i].wave, phase: oscs[i].phase) * oscs[i].gain
                let pan = oscs[i].pan
                let leftGain = min(1, max(0, 1 - pan))
                let rightGain = min(1, max(0, 1 + pan))
                mixL += sample * leftGain
                mixR += sample * rightGain
            }

            for i in shine.indices where shine[i].active || shine[i].gainTarget > 0.0002 {
                shine[i].gain += (shine[i].gainTarget - shine[i].gain) * gainSmooth
                shine[i].pan += (shine[i].panTarget - shine[i].pan) * panSmooth
                if shine[i].gain < 0.0002 && shine[i].gainTarget <= 0.0002 {
                    shine[i].active = false
                    continue
                }
                shine[i].active = true
                shine[i].phase = wrap01(shine[i].phase + shine[i].freq / sr)
                let sample = sin(shine[i].phase * twoPi) * shine[i].gain
                let pan = shine[i].pan
                mixL += sample * min(1, max(0, 1 - pan))
                mixR += sample * min(1, max(0, 1 + pan))
            }

            for i in clicks.indices where clicks[i].active {
                let elapsed = clicks[i].total - clicks[i].remaining
                if elapsed < clicks[i].attackSamples {
                    let t = Double(elapsed) / Double(max(1, clicks[i].attackSamples))
                    clicks[i].amp = 0.0001 + (clicks[i].peak - 0.0001) * t
                } else {
                    clicks[i].amp += (0 - clicks[i].amp) * clicks[i].decayCoeff
                }
                clicks[i].phase = wrap01(clicks[i].phase + clicks[i].freq / sr)
                let sample = (clicks[i].phase < 0.5 ? 1.0 : -1.0) * clicks[i].amp
                mixL += sample
                mixR += sample
                clicks[i].remaining -= 1
                if clicks[i].remaining <= 0 || clicks[i].amp < 0.0002 {
                    clicks[i].active = false
                }
            }

            lpLeft += alpha * (mixL - lpLeft)
            lpRight += alpha * (mixR - lpRight)
            let outL = tanh(lpLeft * master)
            let outR = tanh(lpRight * master)
            left[frame] = Float(max(-1, min(1, outL)))
            if right != left {
                right[frame] = Float(max(-1, min(1, outR)))
            }
        }
    }

    private func waveform(_ wave: Int, phase: Double) -> Double {
        switch wave {
        case 1:
            return 2 * phase - 1
        case 2:
            return phase < 0.5 ? 1 : -1
        default:
            return sin(phase * twoPi)
        }
    }

    private func wrap01(_ value: Double) -> Double {
        var phase = value
        if phase >= 1 { phase -= floor(phase) }
        if phase < 0 { phase += 1 }
        return phase
    }
}
