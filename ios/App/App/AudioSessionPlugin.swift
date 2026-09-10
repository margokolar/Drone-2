import AVFoundation
import Capacitor
import UIKit

/**
 Mixable playback so Drone and Just Keys can sound together.
 Playback ignores the silent switch; mixWithOthers avoids stealing the
 other app's session. Re-apply after WebKit/interruptions, then notify JS.
 */
@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configurePlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configurePlayAndRecord", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deactivate", returnType: CAPPluginReturnPromise),
    ]

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        try? applyMixablePlayback()
        startObserving()
    }

    deinit {
        stopObserving()
    }

    private func applyMixablePlayback() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true, options: [])
    }

    @objc func configurePlayback(_ call: CAPPluginCall) {
        do {
            try applyMixablePlayback()
            call.resolve([
                "category": "playback",
                "mixWithOthers": true,
            ])
        } catch {
            call.reject("Failed to configure playback session", nil, error)
        }
    }

    @objc func configurePlayAndRecord(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
            )
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true, options: [])
            call.resolve(["category": "playAndRecord"])
        } catch {
            call.reject("Failed to configure playAndRecord session", nil, error)
        }
    }

    @objc func activate(_ call: CAPPluginCall) {
        do {
            try applyMixablePlayback()
            call.resolve(["active": true])
        } catch {
            call.reject("Failed to activate audio session", nil, error)
        }
    }

    @objc func deactivate(_ call: CAPPluginCall) {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            call.resolve(["active": false])
        } catch {
            call.reject("Failed to deactivate audio session", nil, error)
        }
    }

    private func startObserving() {
        stopObserving()
        let center = NotificationCenter.default

        observers.append(
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: AVAudioSession.sharedInstance(),
                queue: .main
            ) { [weak self] notification in
                self?.handleInterruption(notification)
            }
        )

        observers.append(
            center.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: AVAudioSession.sharedInstance(),
                queue: .main
            ) { [weak self] notification in
                self?.handleRouteChange(notification)
            }
        )

        observers.append(
            center.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.reclaimAfterForeground()
            }
        )
    }

    private func stopObserving() {
        let center = NotificationCenter.default
        for observer in observers {
            center.removeObserver(observer)
        }
        observers.removeAll()
    }

    private func handleInterruption(_ notification: Notification) {
        guard
            let info = notification.userInfo,
            let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue)
        else {
            return
        }

        switch type {
        case .began:
            notifyListeners(
                "interruption",
                data: [
                    "type": "began",
                    "shouldResume": false,
                ]
            )
        case .ended:
            var shouldResume = true
            if let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                shouldResume = options.contains(.shouldResume)
            }
            if shouldResume {
                do {
                    try applyMixablePlayback()
                } catch {
                    // JS will still try Web Audio resume.
                }
            }
            notifyListeners(
                "interruption",
                data: [
                    "type": "ended",
                    "shouldResume": shouldResume,
                ]
            )
        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        var reason = "unknown"
        if
            let info = notification.userInfo,
            let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let routeReason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        {
            reason = String(describing: routeReason)
        }
        // Re-claim session after route swaps (BT headset, speaker, etc.).
        do {
            try applyMixablePlayback()
        } catch {
            // Ignore; JS recovery still runs.
        }
        notifyListeners(
            "routeChange",
            data: [
                "reason": reason,
            ]
        )
    }

    private func reclaimAfterForeground() {
        do {
            try applyMixablePlayback()
        } catch {
            // Ignore.
        }
        notifyListeners(
            "interruption",
            data: [
                "type": "ended",
                "shouldResume": true,
                "source": "foreground",
            ]
        )
    }
}
