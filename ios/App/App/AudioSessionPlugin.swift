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
    private var notifiedRelease = false
    private var notifiedReclaim = false
    private var reclaimWork: DispatchWorkItem?
    private var reclaimInFlight = false

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

    private func deactivate(notifyOthers: Bool) {
        let options: AVAudioSession.SetActiveOptions = notifyOthers ? [.notifyOthersOnDeactivation] : []
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: options)
        } catch {
            // Already inactive, or Web Audio still holding I/O.
        }
    }

    private func releaseWhenLeavingScreen() {
        reclaimWork?.cancel()
        reclaimWork = nil
        reclaimInFlight = false
        notifiedReclaim = false
        let firstRelease = isOnScreen
        isOnScreen = false
        if firstRelease {
            notifiedRelease = true
            notifyListeners(
                "interruption",
                data: [
                    "type": "began",
                    "shouldResume": false,
                    "source": "background",
                ]
            )
            deactivate(notifyOthers: true)
            scheduleSilentDeactivate(after: 0.04)
            scheduleSilentDeactivate(after: 0.12)
        } else {
            deactivate(notifyOthers: false)
        }
    }

    private func scheduleSilentDeactivate(after delay: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.isOnScreen else { return }
            self.deactivate(notifyOthers: false)
        }
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
        deactivate(notifyOthers: true)
        call.resolve(["active": false])
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
            if !isOnScreen {
                return
            }
            notifyListeners(
                "interruption",
                data: [
                    "type": "began",
                    "shouldResume": false,
                ]
            )
        case .ended:
            guard isOnScreen else { return }
            do {
                try applyExclusivePlayback()
            } catch {
                // JS will still try Web Audio resume.
            }
            notifyReclaimIfNeeded()
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
        if reclaimInFlight {
            if isOnScreen {
                try? applyExclusivePlayback()
            }
            return
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
        notifiedRelease = false
        if notifiedReclaim {
            try? applyExclusivePlayback()
            return
        }
        reclaimInFlight = true
        attemptReclaim(attemptsLeft: 12)
    }

    private func attemptReclaim(attemptsLeft: Int) {
        guard isOnScreen else {
            reclaimInFlight = false
            return
        }
        do {
            try applyExclusivePlayback()
            finishReclaim()
            return
        } catch {
            if attemptsLeft <= 0 {
                finishReclaim()
                return
            }
            let work = DispatchWorkItem { [weak self] in
                self?.attemptReclaim(attemptsLeft: attemptsLeft - 1)
            }
            reclaimWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02, execute: work)
        }
    }

    private func finishReclaim() {
        reclaimInFlight = false
        notifyReclaimIfNeeded()
    }

    private func notifyReclaimIfNeeded() {
        guard isOnScreen, !notifiedReclaim else { return }
        notifiedReclaim = true
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
