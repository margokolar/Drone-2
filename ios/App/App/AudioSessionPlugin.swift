import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

/**
 Exclusive playback only while the drone is sounding — never in the car.
 A CarPlay / car-audio route yields the session immediately so the car
 radio keeps playing. Phone, lock screen, and headphones are unchanged.
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
        startObserving()
        setupRemoteCommands()
        DispatchQueue.main.async { [weak self] in
            self?.yieldIfCarAudio()
        }
    }

    deinit {
        stopObserving()
        clearRemoteCommands()
    }

    private func applyExclusivePlayback(claim: Bool = false) throws {
        if DroneSynthEngine.isCarAudioRoute {
            yieldIfCarAudio()
            return
        }
        guard isOnScreen else { return }
        if !claim && !DroneSynthEngine.shared.wantsPlaybackSession {
            return
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
            try applyExclusivePlayback(claim: true)
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
            try applyExclusivePlayback(claim: true)
            call.resolve(["active": isOnScreen])
        } catch {
            call.reject("Failed to activate audio session", nil, error)
        }
    }

    @objc func deactivate(_ call: CAPPluginCall) {
        DroneSynthEngine.shared.releasePlaybackSession()
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
        if call.getBool("playing") == false {
            DroneSynthEngine.shared.releasePlaybackSession()
            call.resolve()
            return
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
        command.isEnabled = false
        command.removeTarget(nil)
        command.addTarget { [weak self] _ in
            self?.handleRemote(action)
            return .success
        }
    }

    private func handleRemote(_ action: String) {
        switch action {
        case "pause":
            DroneSynthEngine.shared.releasePlaybackSession()
        case "play":
            try? applyExclusivePlayback(claim: true)
            DroneSynthEngine.shared.resumeAfterRemote()
        case "toggle":
            if DroneSynthEngine.shared.isAudible {
                DroneSynthEngine.shared.releasePlaybackSession()
            } else {
                try? applyExclusivePlayback(claim: true)
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
            ) { [weak self] _ in
                UIApplication.shared.isIdleTimerDisabled = false
                self?.yieldIfSilent()
            }
        )

        observers.append(
            center.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.yieldIfSilent()
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
            DroneSynthEngine.shared.releasePlaybackSession()
            notifyListeners(
                "interruption",
                data: [
                    "type": "began",
                    "shouldResume": false,
                ]
            )
        case .ended:
            var shouldResume = false
            if let value = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                shouldResume = AVAudioSession.InterruptionOptions(rawValue: value).contains(.shouldResume)
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
        if DroneSynthEngine.isCarAudioRoute {
            yieldIfCarAudio()
            return
        }
        var reason = "unknown"
        if
            let info = notification.userInfo,
            let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let routeReason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        {
            reason = String(describing: routeReason)
        }
        notifyListeners(
            "routeChange",
            data: [
                "reason": reason,
            ]
        )
    }

    private func yieldIfCarAudio() {
        guard DroneSynthEngine.isCarAudioRoute else { return }
        reclaimInFlight = false
        DroneSynthEngine.shared.releasePlaybackSession()
        notifyListeners(
            "interruption",
            data: [
                "type": "began",
                "shouldResume": false,
                "source": "car",
            ]
        )
    }

    private func yieldIfSilent() {
        if DroneSynthEngine.isCarAudioRoute {
            yieldIfCarAudio()
            return
        }
        guard !DroneSynthEngine.shared.wantsPlaybackSession else { return }
        DroneSynthEngine.shared.releasePlaybackSession()
    }

    private func reclaimAfterForeground() {
        isOnScreen = true
        DroneSynthEngine.shared.appearOnScreen()
        if DroneSynthEngine.isCarAudioRoute {
            reclaimInFlight = false
            yieldIfCarAudio()
            return
        }
        guard DroneSynthEngine.shared.wantsPlaybackSession else {
            reclaimInFlight = false
            DroneSynthEngine.shared.releasePlaybackSession()
            return
        }
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
            if DroneSynthEngine.isCarAudioRoute {
                yieldIfCarAudio()
                reclaimInFlight = false
                return
            }
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
