import Capacitor
import UIKit

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioSessionPlugin())
    }
}
