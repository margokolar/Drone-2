import Capacitor
import Foundation
import UIKit

@objc(DroneSynthPlugin)
public class DroneSynthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DroneSynthPlugin"
    public let jsName = "DroneSynth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "reclaim", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "park", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setGraph", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fadeMaster", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "click", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setShine", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearShine", returnType: CAPPluginReturnPromise),
    ]

    @objc func reclaim(_ call: CAPPluginCall) {
        do {
            try DroneSynthEngine.shared.reclaim()
            call.resolve(["active": true])
        } catch {
            NSLog("DroneSynth reclaim: \(error.localizedDescription)")
            call.resolve(["active": false])
        }
    }

    @objc func park(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.park()
        call.resolve(["active": false])
    }

    @objc func setGraph(_ call: CAPPluginCall) {
        let packed = call.getString("packed") ?? ""
        DroneSynthEngine.shared.setGraph(
            master: Self.number(call, "master", 0.3),
            fadeSeconds: Self.number(call, "fadeSeconds", 0),
            fadeInSeconds: Self.number(call, "fadeInSeconds", 0),
            fadeOutSeconds: Self.number(call, "fadeOutSeconds", 0),
            oscillators: Self.parsePacked(packed)
        )
        call.resolve()
    }

    @objc func fadeMaster(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.fadeMaster(
            to: Self.number(call, "target", 0.0001),
            seconds: Self.number(call, "seconds", 0)
        )
        call.resolve()
    }

    @objc func mute(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.mute()
        call.resolve()
    }

    @objc func click(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.click(
            frequency: Self.number(call, "frequency", 1240),
            peak: Self.number(call, "peak", 0.2)
        )
        call.resolve()
    }

    @objc func setMetronome(_ call: CAPPluginCall) {
        let on = Self.number(call, "on", Self.flag(call, "enabled") ? 1 : 0) > 0.5
        let mute = Self.number(call, "mute", Self.flag(call, "muted") ? 1 : 0) > 0.5
        DroneSynthEngine.shared.setMetronome(
            enabled: on,
            bpm: Self.number(call, "bpm", 72),
            volumeDb: Self.number(call, "volumeDb", -6),
            muted: mute
        )
        call.resolve()
    }

    @objc func setShine(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.setShine(items: Self.parseShinePacked(call.getString("packed") ?? ""))
        call.resolve()
    }

    @objc func clearShine(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.clearShine()
        call.resolve()
    }

    private static func flag(_ call: CAPPluginCall, _ key: String) -> Bool {
        if let value = call.getBool(key) {
            return value
        }
        if let value = call.getInt(key) {
            return value != 0
        }
        if let value = call.getDouble(key) {
            return value != 0
        }
        return false
    }

    private static func number(_ call: CAPPluginCall, _ key: String, _ fallback: Double) -> Double {
        if let value = call.getDouble(key) {
            return value
        }
        if let value = call.getFloat(key) {
            return Double(value)
        }
        if let value = call.getInt(key) {
            return Double(value)
        }
        if let value = call.options[key] as? NSNumber {
            return value.doubleValue
        }
        if let value = call.options[key] as? String, let parsed = Double(value) {
            return parsed
        }
        return fallback
    }

    /// `id \t wave \t freq \t gain \t pan \t glideFrom \t glideSeconds`, lines split by `\n`.
    private static func parsePacked(_ packed: String) -> [DroneSynthEngine.OscSpec] {
        guard !packed.isEmpty else { return [] }
        var out: [DroneSynthEngine.OscSpec] = []
        packed.split(separator: "\n", omittingEmptySubsequences: true).forEach { line in
            let parts = line.split(separator: "\t", omittingEmptySubsequences: false)
            guard parts.count >= 5 else { return }
            out.append(
                DroneSynthEngine.OscSpec(
                    id: String(parts[0]),
                    wave: Int(parts[1]) ?? 0,
                    freq: Double(parts[2]) ?? 0,
                    gain: Double(parts[3]) ?? 0,
                    pan: Double(parts[4]) ?? 0,
                    glideFrom: parts.count > 5 ? (Double(parts[5]) ?? 0) : 0,
                    glideSeconds: parts.count > 6 ? (Double(parts[6]) ?? 0) : 0
                )
            )
        }
        return out
    }

    private static func parseShinePacked(_ packed: String) -> [[String: Any]] {
        guard !packed.isEmpty else { return [] }
        return packed.split(separator: "\n", omittingEmptySubsequences: true).compactMap { line -> [String: Any]? in
            let parts = line.split(separator: "\t", omittingEmptySubsequences: false)
            guard parts.count >= 3 else { return nil }
            return [
                "freq": Double(parts[0]) ?? 0,
                "gain": Double(parts[1]) ?? 0,
                "pan": Double(parts[2]) ?? 0,
            ]
        }
    }
}
