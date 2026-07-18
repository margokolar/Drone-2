#!/bin/bash
# Deploys the app to a connected iPhone:
#   web build -> cap sync ios -> xcodebuild -> install & launch via devicectl
#
# Prereqs (one-time, done in Xcode): signing team selected for the App target,
# Developer Mode enabled on the iPhone, phone paired/trusted with this Mac.
#
# NOTE: with a free Apple ID the install expires after 7 days; just re-run
# this script to refresh it.

set -euo pipefail
cd "$(dirname "$0")/.."

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

BUNDLE_ID="com.margokolar.bourdon"
DERIVED_DATA="ios/DerivedData"

echo "==> Building web app"
npm run build

echo "==> Syncing Capacitor"
npx cap sync ios

echo "==> Looking for a connected iPhone"
DEVICE_JSON=$(mktemp)
xcrun devicectl list devices --json-output "$DEVICE_JSON" >/dev/null

UDID=$(python3 - "$DEVICE_JSON" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
devices = data.get("result", {}).get("devices", [])
for d in devices:
    props = d.get("deviceProperties", {})
    hw = d.get("hardwareProperties", {})
    conn = d.get("connectionProperties", {})
    if hw.get("platform") == "iOS" and conn.get("tunnelState") != "unavailable":
        print(d.get("identifier", ""))
        break
EOF
)
rm -f "$DEVICE_JSON"

if [ -n "$UDID" ]; then
  DESTINATION="id=$UDID"
  echo "    Device: $UDID"
else
  # No phone reachable: still produce a full device build so it is ready to
  # install the next time the phone shows up.
  DESTINATION="generic/platform=iOS"
  echo "    No iPhone reachable - building only (install will be skipped)."
fi

echo "==> Building iOS app (xcodebuild)"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  build

APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/App.app"
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: Built app not found at $APP_PATH"
  exit 1
fi

if [ -z "$UDID" ]; then
  echo "==> Done (build only). App is ready at:"
  echo "    $APP_PATH"
  echo "    Connect the iPhone (cable or same Wi-Fi after pairing) and re-run"
  echo "    'npm run ios' to install it."
  exit 0
fi

echo "==> Installing on device"
xcrun devicectl device install app --device "$UDID" "$APP_PATH"

echo "==> Launching"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID" || {
  echo "(Launch failed - if this is the first install, tap the icon on the"
  echo " phone and approve the developer in Settings > General > VPN & Device"
  echo " Management, then Developer Mode prompts if any.)"
}

echo "==> Done"
