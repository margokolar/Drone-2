import Capacitor
import UniformTypeIdentifiers
import UIKit

@objc(LoopFilePickerPlugin)
public class LoopFilePickerPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "LoopFilePickerPlugin"
    public let jsName = "LoopFilePicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickAudio", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?
    private var picker: UIDocumentPickerViewController?

    @objc func pickAudio(_ call: CAPPluginCall) {
        if pendingCall != nil {
            call.reject("A file picker is already open")
            return
        }
        pendingCall = call
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            var types: [UTType] = [.wav, .mp3, .mpeg4Audio, .aiff, .flac, .audio]
            if let ogg = UTType("org.xiph.ogg") {
                types.append(ogg)
            }
            if let opus = UTType("org.xiph.opus") {
                types.append(opus)
            }
            let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            documentPicker.allowsMultipleSelection = false
            documentPicker.delegate = self
            guard let presenter = self.bridge?.viewController else {
                self.finish(canceled: true)
                return
            }
            if let popover = documentPicker.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(
                    x: presenter.view.bounds.midX,
                    y: presenter.view.bounds.midY,
                    width: 1,
                    height: 1
                )
            }
            self.picker = documentPicker
            presenter.present(documentPicker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        defer {
            picker = nil
        }
        guard let url = urls.first else {
            finish(canceled: true)
            return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer {
            if accessed {
                url.stopAccessingSecurityScopedResource()
            }
        }
        do {
            let data = try Data(contentsOf: url)
            finish(
                canceled: false,
                name: url.lastPathComponent,
                data: data.base64EncodedString(),
            )
        } catch {
            pendingCall?.reject(error.localizedDescription)
            pendingCall = nil
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        picker = nil
        finish(canceled: true)
    }

    private func finish(canceled: Bool, name: String? = nil, data: String? = nil) {
        var payload: [String: Any] = ["canceled": canceled]
        if let name {
            payload["name"] = name
        }
        if let data {
            payload["data"] = data
        }
        pendingCall?.resolve(payload)
        pendingCall = nil
    }
}
