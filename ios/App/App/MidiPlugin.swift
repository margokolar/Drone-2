import Capacitor
import CoreAudioKit
import CoreMIDI

private func droneMidiReadProc(
    packetList: UnsafePointer<MIDIPacketList>,
    readProcRefCon: UnsafeMutableRawPointer?,
    srcConnRefCon: UnsafeMutableRawPointer?
) {
    guard let readProcRefCon else {
        return
    }
    let plugin = Unmanaged<MidiPlugin>.fromOpaque(readProcRefCon).takeUnretainedValue()
    let sourceId = srcConnRefCon.map { Int(bitPattern: $0) } ?? 0
    plugin.handleIncomingPackets(packetList, sourceId: sourceId)
}

/**
 Core MIDI in/out for BLE / USB devices (e.g. PIRATE MIDI Scribble).
 */
@objc(MidiPlugin)
public class MidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MidiPlugin"
    public let jsName = "Midi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listDestinations", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listSources", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendProgramChange", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendProgramChangeToScribble", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "findDestinationForSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBluetoothMidiPicker", returnType: CAPPluginReturnPromise),
    ]

    private var client: MIDIClientRef = 0
    private var outputPort: MIDIPortRef = 0
    private var inputPort: MIDIPortRef = 0
    private var clientReady = false

    override public func load() {
        ensureClient()
    }

    deinit {
        disconnectAllSources()
    }

    fileprivate func handleIncomingPackets(_ packetList: UnsafePointer<MIDIPacketList>, sourceId: Int) {
        var packet = packetList.pointee.packet
        for packetIndex in 0 ..< packetList.pointee.numPackets {
            let bytes = readPacketBytes(packet)
            emitParsedMessages(bytes, sourceId: sourceId)
            if packetIndex + 1 < packetList.pointee.numPackets {
                packet = MIDIPacketNext(&packet).pointee
            }
        }
    }

    private func ensureClient() {
        guard !clientReady else {
            return
        }
        let status = MIDIClientCreate("DroneMidi" as CFString, nil, nil, &client)
        guard status == noErr else {
            return
        }
        let portStatus = MIDIOutputPortCreate(client, "Drone Out" as CFString, &outputPort)
        guard portStatus == noErr else {
            return
        }
        clientReady = true
    }

    private func ensureInputPort() -> Bool {
        ensureClient()
        guard clientReady else {
            return false
        }
        if inputPort != 0 {
            return true
        }
        let ref = Unmanaged.passUnretained(self).toOpaque()
        let status = MIDIInputPortCreate(client, "Drone In" as CFString, droneMidiReadProc, ref, &inputPort)
        return status == noErr
    }

    private func endpointName(_ endpoint: MIDIEndpointRef) -> String {
        var param: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyName, &param)
        if status == noErr, let name = param?.takeRetainedValue() as String? {
            return name
        }
        return "MIDI"
    }

    private func connectionUniqueId(_ endpoint: MIDIEndpointRef) -> Int32? {
        var value: Int32 = 0
        let status = MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyConnectionUniqueID, &value)
        return status == noErr ? value : nil
    }

    private func normalizedMidiName(_ name: String) -> String {
        name
            .lowercased()
            .replacingOccurrences(of: " bluetooth", with: "")
            .replacingOccurrences(of: " ble", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func isScribbleName(_ name: String) -> Bool {
        normalizedMidiName(name).contains("scribble")
    }

    private func resolveScribbleDestinations(preferredSourceId: Int?) -> [MIDIEndpointRef] {
        var resolved: [MIDIEndpointRef] = []
        var seen = Set<Int>()

        func appendUnique(_ endpoint: MIDIEndpointRef) {
            let key = Int(endpoint)
            guard !seen.contains(key) else {
                return
            }
            seen.insert(key)
            resolved.append(endpoint)
        }

        if let preferredSourceId {
            let source = MIDIEndpointRef(preferredSourceId)
            if let connectionId = connectionUniqueId(source) {
                let destinationCount = MIDIGetNumberOfDestinations()
                for index in 0 ..< destinationCount {
                    let destination = MIDIGetDestination(index)
                    if connectionUniqueId(destination) == connectionId {
                        appendUnique(destination)
                    }
                }
            }
            let sourceName = normalizedMidiName(endpointName(source))
            let destinationCount = MIDIGetNumberOfDestinations()
            for index in 0 ..< destinationCount {
                let destination = MIDIGetDestination(index)
                if normalizedMidiName(endpointName(destination)) == sourceName {
                    appendUnique(destination)
                }
            }
        }

        let destinationCount = MIDIGetNumberOfDestinations()
        for index in 0 ..< destinationCount {
            let destination = MIDIGetDestination(index)
            if isScribbleName(endpointName(destination)) {
                appendUnique(destination)
            }
        }

        return resolved
    }

    @objc func listDestinations(_ call: CAPPluginCall) {
        ensureClient()
        var result: [[String: Any]] = []
        let count = MIDIGetNumberOfDestinations()
        for index in 0 ..< count {
            let endpoint = MIDIGetDestination(index)
            result.append([
                "id": Int(endpoint),
                "name": endpointName(endpoint),
            ])
        }
        call.resolve(["destinations": result])
    }

    @objc func listSources(_ call: CAPPluginCall) {
        ensureClient()
        var result: [[String: Any]] = []
        let count = MIDIGetNumberOfSources()
        for index in 0 ..< count {
            let endpoint = MIDIGetSource(index)
            result.append([
                "id": Int(endpoint),
                "name": endpointName(endpoint),
            ])
        }
        call.resolve(["sources": result])
    }

    @objc func findDestinationForSource(_ call: CAPPluginCall) {
        ensureClient()
        guard let sourceId = call.getInt("sourceId") else {
            call.reject("sourceId required")
            return
        }
        let destinations = resolveScribbleDestinations(preferredSourceId: sourceId)
        guard let first = destinations.first else {
            call.reject("No paired destination found")
            return
        }
        call.resolve([
            "destinationId": Int(first),
            "name": endpointName(first),
            "count": destinations.count,
        ])
    }

    @objc func startListening(_ call: CAPPluginCall) {
        guard ensureInputPort() else {
            call.reject("MIDI input not ready")
            return
        }
        disconnectAllSources()
        if let sourceId = call.getInt("sourceId") {
            let source = MIDIEndpointRef(sourceId)
            MIDIPortConnectSource(inputPort, source, UnsafeMutableRawPointer(bitPattern: sourceId))
        } else {
            let count = MIDIGetNumberOfSources()
            for index in 0 ..< count {
                let source = MIDIGetSource(index)
                MIDIPortConnectSource(
                    inputPort,
                    source,
                    UnsafeMutableRawPointer(bitPattern: Int(source))
                )
            }
        }
        call.resolve(["listening": true])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        disconnectAllSources()
        call.resolve(["listening": false])
    }

    @objc func sendProgramChange(_ call: CAPPluginCall) {
        ensureClient()
        guard clientReady else {
            call.reject("MIDI client not ready")
            return
        }
        guard
            let destinationId = call.getInt("destinationId"),
            let program = call.getInt("program")
        else {
            call.reject("destinationId and program required")
            return
        }
        let channel = call.getInt("channel") ?? 1
        guard channel >= 1, channel <= 16, program >= 0, program <= 127 else {
            call.reject("Invalid channel or program")
            return
        }

        let endpoint = MIDIEndpointRef(destinationId)
        let statusByte = UInt8(0xC0 | ((channel - 1) & 0x0F))
        let programByte = UInt8(program & 0x7F)
        let status = sendBytes(to: endpoint, bytes: [statusByte, programByte])
        if status != noErr {
            call.reject("MIDISend failed (\(status))")
            return
        }
        call.resolve(["sent": true, "program": program, "channel": channel])
    }

    @objc func sendProgramChangeToScribble(_ call: CAPPluginCall) {
        ensureClient()
        guard clientReady else {
            call.reject("MIDI client not ready")
            return
        }
        guard let program = call.getInt("program") else {
            call.reject("program required")
            return
        }
        let channel = call.getInt("channel") ?? 1
        guard channel >= 1, channel <= 16, program >= 0, program <= 127 else {
            call.reject("Invalid channel or program")
            return
        }

        let destinations = resolveScribbleDestinations(preferredSourceId: call.getInt("sourceId"))
        guard !destinations.isEmpty else {
            call.reject("No Scribble MIDI destination found")
            return
        }

        let statusByte = UInt8(0xC0 | ((channel - 1) & 0x0F))
        let programByte = UInt8(program & 0x7F)
        let bytes = [statusByte, programByte]
        var sentCount = 0
        var firstDestinationId = 0
        for destination in destinations {
            if sendBytes(to: destination, bytes: bytes) == noErr {
                sentCount += 1
                if firstDestinationId == 0 {
                    firstDestinationId = Int(destination)
                }
            }
        }
        if sentCount == 0 {
            call.reject("MIDISend failed for all destinations")
            return
        }
        call.resolve([
            "sent": true,
            "program": program,
            "channel": channel,
            "destinationId": firstDestinationId,
            "destinationCount": sentCount,
        ])
    }

    @objc func showBluetoothMidiPicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let viewController = self?.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            let picker = CABTMIDICentralViewController()
            viewController.present(picker, animated: true) {
                call.resolve(["presented": true])
            }
        }
    }

    private func disconnectAllSources() {
        guard inputPort != 0 else {
            return
        }
        let count = MIDIGetNumberOfSources()
        for index in 0 ..< count {
            MIDIPortDisconnectSource(inputPort, MIDIGetSource(index))
        }
    }

    private func readPacketBytes(_ packet: MIDIPacket) -> [UInt8] {
        var bytes: [UInt8] = []
        bytes.reserveCapacity(Int(packet.length))
        withUnsafePointer(to: packet.data) { dataPtr in
            let raw = UnsafeRawPointer(dataPtr).assumingMemoryBound(to: UInt8.self)
            for index in 0 ..< Int(packet.length) {
                bytes.append(raw[index])
            }
        }
        return bytes
    }

    private func emitParsedMessages(_ bytes: [UInt8], sourceId: Int) {
        var index = 0
        var runningStatus: UInt8 = 0
        while index < bytes.count {
            var status = bytes[index]
            if status < 0x80 {
                guard runningStatus != 0 else {
                    index += 1
                    continue
                }
                status = runningStatus
            } else {
                if status >= 0x80 && status < 0xF0 {
                    runningStatus = status
                }
                index += 1
            }

            let highNibble = status & 0xF0
            let channel = Int((status & 0x0F) + 1)

            switch highNibble {
            case 0xC0:
                guard index < bytes.count else { return }
                let program = Int(bytes[index] & 0x7F)
                index += 1
                notifyListeners(
                    "midiMessage",
                    data: [
                        "type": "programChange",
                        "channel": channel,
                        "program": program,
                        "sourceId": sourceId,
                    ]
                )
            case 0xB0:
                guard index + 1 < bytes.count else { return }
                let controller = Int(bytes[index] & 0x7F)
                let value = Int(bytes[index + 1] & 0x7F)
                index += 2
                notifyListeners(
                    "midiMessage",
                    data: [
                        "type": "controlChange",
                        "channel": channel,
                        "controller": controller,
                        "value": value,
                        "sourceId": sourceId,
                    ]
                )
            case 0x80, 0x90, 0xA0, 0xE0:
                index += 2
            case 0xD0:
                index += 1
            default:
                break
            }
        }
    }

    @discardableResult
    private func sendBytes(to destination: MIDIEndpointRef, bytes: [UInt8]) -> OSStatus {
        guard !bytes.isEmpty else {
            return noErr
        }
        var buffer = [UInt8](repeating: 0, count: 256)
        let status = buffer.withUnsafeMutableBufferPointer { bufferPtr -> OSStatus in
            guard let base = bufferPtr.baseAddress else {
                return -1
            }
            let packetList = UnsafeMutablePointer<MIDIPacketList>(OpaquePointer(base))
            let packet = MIDIPacketListInit(packetList)
            guard MIDIPacketListAdd(packetList, 256, packet, 0, bytes.count, bytes) != nil else {
                return -1
            }
            return MIDISend(outputPort, destination, packetList)
        }
        return status
    }
}
