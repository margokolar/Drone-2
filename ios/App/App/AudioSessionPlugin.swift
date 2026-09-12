import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

/**
 Exclusive playback session that ignores the silent switch.
 Lock screen / Home keep the drone running (background audio mode).
 Another app that takes the session (Just Keys, a call) interrupts us;
 we pause the engine and reclaim when this app is active again.
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
        CAPPluginMethod(name: "setKeepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNowPlaying", returnType: CAPPluginReturnPromise),
    ]

    private var observers: [NSObjectProtocol] = []
    private var isOnScreen = true
    private var notifiedReclaim = false
    private var reclaimWork: DispatchWorkItem?
    private var reclaimInFlight = false

    override public func load() {
        isOnScreen = true
        try? applyExclusivePlayback()
        startObserving()
        setupRemoteCommands()
    }

    deinit {
        stopObserving()
        clearRemoteCommands()
    }

    private func applyExclusivePlayback() throws {
        guard isOnScreen else { return }
        let session = AVAudioSession.sharedInstance()
        let alreadyExclusive =
            session.category == .playback && session.categoryOptions.isEmpty
        if !alreadyExclusive {
            try session.setCategory(.playback, mode: .default, options: [])
        }
        try DroneSynthEngine.shared.applyPlaybackSession()
        try DroneSynthEngine.shared.reclaim()
    }

    private func deactivate(notifyOthers: Bool) {
        let options: AVAudioSession.SetActiveOptions = notifyOthers ? [.notifyOthersOnDeactivation] : []
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: options)
        } catch {
            // Already inactive, or Web Audio still holding I/O.
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

    @objc func setKeepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
        }
        call.resolve(["on": on])
    }

    @objc func setNowPlaying(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Drone"
        let artist = call.getString("artist") ?? "Drone"
        let sequence = (call.getArray("sequence") ?? []).compactMap { item -> String? in
            if let text = item as? String {
                return text
            }
            if let text = item as? NSString {
                return text as String
            }
            return nil
        }
        let activeIndex: Int
        if let value = call.getInt("activeIndex") {
            activeIndex = value
        } else if let value = call.getDouble("activeIndex") {
            activeIndex = Int(value)
        } else {
            activeIndex = -1
        }
        DroneSynthEngine.shared.setNowPlayingLabels(
            title: title,
            artist: artist,
            sequence: sequence,
            activeIndex: activeIndex
        )
        call.resolve()
    }

    private func setupRemoteCommands() {
        UIApplication.shared.beginReceivingRemoteControlEvents()
        let center = MPRemoteCommandCenter.shared()
        bind(center.playCommand, "play")
        bind(center.pauseCommand, "pause")
        bind(center.togglePlayPauseCommand, "toggle")
        bind(center.nextTrackCommand, "next")
        bind(center.previousTrackCommand, "previous")
        center.skipForwardCommand.removeTarget(nil)
        center.skipBackwardCommand.removeTarget(nil)
        center.skipForwardCommand.isEnabled = false
        center.skipBackwardCommand.isEnabled = false
        center.stopCommand.isEnabled = false
        center.seekForwardCommand.isEnabled = false
        center.seekBackwardCommand.isEnabled = false
        center.changePlaybackPositionCommand.isEnabled = false
    }

    private func clearRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        [
            center.playCommand,
            center.pauseCommand,
            center.togglePlayPauseCommand,
            center.nextTrackCommand,
            center.previousTrackCommand,
            center.skipForwardCommand,
            center.skipBackwardCommand,
        ].forEach { $0.removeTarget(nil) }
    }

    private func bind(_ command: MPRemoteCommand, _ action: String) {
        command.isEnabled = true
        command.removeTarget(nil)
        command.addTarget { [weak self] _ in
            self?.handleRemote(action)
            return .success
        }
    }

    private func handleRemote(_ action: String) {
        switch action {
        case "pause":
            DroneSynthEngine.shared.mute()
        case "play":
            try? applyExclusivePlayback()
            DroneSynthEngine.shared.resumeAfterRemote()
        case "toggle":
            if DroneSynthEngine.shared.isAudible {
                DroneSynthEngine.shared.mute()
            } else {
                try? applyExclusivePlayback()
                DroneSynthEngine.shared.resumeAfterRemote()
            }
        default:
            break
        }
        notifyListeners("remoteCommand", data: ["action": action])
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

        observers.append(
            center.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { _ in
                UIApplication.shared.isIdleTimerDisabled = false
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
            DroneSynthEngine.shared.suspend()
            notifyListeners(
                "interruption",
                data: [
                    "type": "began",
                    "shouldResume": false,
                ]
            )
        case .ended:
            var shouldResume = true
            if let value = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                shouldResume = AVAudioSession.InterruptionOptions(rawValue: value).contains(.shouldResume)
            }
            if shouldResume || UIApplication.shared.applicationState == .active {
                do {
                    try applyExclusivePlayback()
                } catch {
                    // JS may still restore the graph.
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
