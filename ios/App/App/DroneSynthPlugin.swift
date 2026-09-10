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
        CAPPluginMethod(name: "setShine", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearShine", returnType: CAPPluginReturnPromise),
    ]

    @objc func reclaim(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState == .active else {
            call.resolve(["active": false])
            return
        }
        do {
            try DroneSynthEngine.shared.reclaim()
            call.resolve(["active": true])
        } catch {
            call.reject("Failed to start native drone", nil, error)
        }
    }

    @objc func park(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.park()
        call.resolve(["active": false])
    }

    @objc func setGraph(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState == .active else {
            call.resolve()
            return
        }
        let master = Double(call.getFloat("master") ?? 0.0001)
        let fadeSeconds = Double(call.getFloat("fadeSeconds") ?? 0)
        DroneSynthEngine.shared.setGraph(
            master: master,
            fadeSeconds: fadeSeconds,
            oscillators: Self.dicts(call, "oscillators")
        )
        call.resolve()
    }

    @objc func fadeMaster(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.fadeMaster(
            to: Double(call.getFloat("target") ?? 0.0001),
            seconds: Double(call.getFloat("seconds") ?? 0)
        )
        call.resolve()
    }

    @objc func mute(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.mute()
        call.resolve()
    }

    @objc func click(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState == .active else {
            call.resolve()
            return
        }
        DroneSynthEngine.shared.click(
            frequency: Double(call.getFloat("frequency") ?? 1240),
            peak: Double(call.getFloat("peak") ?? 0.2)
        )
        call.resolve()
    }

    @objc func setShine(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState == .active else {
            call.resolve()
            return
        }
        DroneSynthEngine.shared.setShine(items: Self.dicts(call, "items"))
        call.resolve()
    }

    @objc func clearShine(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.clearShine()
        call.resolve()
    }

    private static func dicts(_ call: CAPPluginCall, _ key: String) -> [[String: Any]] {
        guard let raw = call.getArray(key) else { return [] }
        return raw.compactMap { $0 as? [String: Any] }
    }
}
