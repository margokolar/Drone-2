import AVFoundation
import Capacitor
import UIKit

/**
 Exclusive playback for the on-screen app.
 Drone and Just Keys do not mix: leaving the screen releases the session
 (notifyOthersOnDeactivation) so the visible app can take audio.
 Playback still ignores the silent switch.
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
    private var isOnScreen = true

    override public func load() {
        isOnScreen = true
        try? applyExclusivePlayback()
        startObserving()
    }

    deinit {
        stopObserving()
    }

    private func applyExclusivePlayback() throws {
        guard isOnScreen else { return }
        let session = AVAudioSession.sharedInstance()
        let alreadyExclusive =
            session.category == .playback && session.categoryOptions.isEmpty
        if !alreadyExclusive {
            try session.setCategory(.playback, mode: .default, options: [])
        }
        try session.setActive(true, options: [])
    }

    private func releaseWhenLeavingScreen() {
        isOnScreen = false
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            // Already inactive.
        }
        notifyListeners(
            "interruption",
            data: [
                "type": "began",
                "shouldResume": false,
                "source": "background",
            ]
        )
    }

    @objc func configurePlayback(_ call: CAPPluginCall) {
        do {
            try applyExclusivePlayback()
            call.resolve([
                "category": "playback",
                "onScreen": isOnScreen,
            ])
        } catch {
            call.reject("Failed to configure playback session", nil, error)
        }
    }

    @objc func configurePlayAndRecord(_ call: CAPPluginCall) {
        do {
            guard isOnScreen else {
                call.resolve(["category": "playAndRecord", "onScreen": false])
                return
            }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.defaultToSpeaker, .allowBluetooth]
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
            try applyExclusivePlayback()
            call.resolve(["active": isOnScreen])
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
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.releaseWhenLeavingScreen()
            }
        )

        observers.append(
            center.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.releaseWhenLeavingScreen()
            }
        )

        observers.append(
            center.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.reclaimAfterForeground()
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
            let shouldResume = isOnScreen
            if shouldResume {
                do {
                    try applyExclusivePlayback()
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
        if isOnScreen {
            do {
                try applyExclusivePlayback()
            } catch {
                // Ignore; JS recovery still runs.
            }
        }
        notifyListeners(
            "routeChange",
            data: [
                "reason": reason,
            ]
        )
    }

    private func reclaimAfterForeground() {
        isOnScreen = true
        do {
            try applyExclusivePlayback()
        } catch {
            // Just Keys may still be releasing — retry below.
        }
        notifyListeners(
            "interruption",
            data: [
                "type": "ended",
                "shouldResume": true,
                "source": "foreground",
            ]
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self, self.isOnScreen else { return }
            try? self.applyExclusivePlayback()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self, self.isOnScreen else { return }
            try? self.applyExclusivePlayback()
        }
    }
}
