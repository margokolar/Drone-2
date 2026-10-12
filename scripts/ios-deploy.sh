#!/bin/bash
# Deploys the app to a connected iPhone:
#   web build -> cap sync ios -> xcodebuild -> install & launch via devicectl
#
# Prereqs (one-time, done in Xcode): signing team selected for the App target,
# Developer Mode enabled on the iPhone, phone paired/trusted with this Mac.
#
# NOTE: with a free Apple ID the install expires after 7 days; just re-run
# this script to refresh it.
#
# REQUIRE_INSTALL=1  (used by ~/deploy-ios-apps.sh)
#   Fail instead of "build only" when the phone is not reachable, and fail if
#   the app is not actually installed. A build without an install can mint a
#   new 7-day profile and immediately kill the copy already on the phone.

set -euo pipefail
cd "$(dirname "$0")/.."

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

BUNDLE_ID="com.margokolar.bourdon"
DERIVED_DATA="ios/DerivedData"
REQUIRE_INSTALL="${REQUIRE_INSTALL:-0}"

find_phone_udid() {
  local device_json
  device_json=$(mktemp)
  xcrun devicectl list devices --json-output "$device_json" >/dev/null
  python3 - "$device_json" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
devices = data.get("result", {}).get("devices", [])
candidates = []
for d in devices:
    hw = d.get("hardwareProperties", {})
    conn = d.get("connectionProperties", {})
    if hw.get("reality") != "physical":
        continue
    if hw.get("platform") != "iOS":
        continue
    if conn.get("tunnelState") == "unavailable":
        continue
    identifier = hw.get("udid") or d.get("identifier", "")
    if not identifier:
        continue
    iphone = 0 if hw.get("deviceType") == "iPhone" else 1
    wired = 0 if conn.get("transportType") == "wired" else 1
    candidates.append((iphone, wired, identifier))
candidates.sort()
if candidates:
    print(candidates[0][2])
EOF
  rm -f "$device_json"
}

app_is_on_phone() {
  local udid="$1"
  local bundle_id="$2"
  local apps_json
  apps_json=$(mktemp)
  if ! xcrun devicectl device info apps --device "$udid" --json-output "$apps_json" >/dev/null; then
    rm -f "$apps_json"
    return 1
  fi
  local ok=0
  python3 - "$apps_json" "$bundle_id" <<'EOF' || ok=1
import json, sys

data = json.load(open(sys.argv[1]))
wanted = sys.argv[2]

def walk(obj):
    if isinstance(obj, dict):
        if obj.get("bundleIdentifier") == wanted or obj.get("bundleID") == wanted:
            return True
        return any(walk(value) for value in obj.values())
    if isinstance(obj, list):
        return any(walk(value) for value in obj)
    return False

sys.exit(0 if walk(data) else 1)
EOF
  rm -f "$apps_json"
  return "$ok"
}

echo "==> Looking for a connected iPhone"
UDID="$(find_phone_udid)"

if [ -n "$UDID" ]; then
  DESTINATION="id=$UDID"
  echo "    Device: $UDID"
else
  DESTINATION="generic/platform=iOS"
  if [ "$REQUIRE_INSTALL" = "1" ]; then
    echo "ERROR: iPhone is not connected (cable or paired Wi-Fi) and unlocked."
    echo "       The 7-day permission was NOT refreshed. Unlock the phone and re-run."
    exit 1
  fi
  echo "    No iPhone reachable - building only (install will be skipped)."
fi

echo "==> Building web app"
npm run build

echo "==> Syncing Capacitor"
npx cap sync ios

echo "==> Building iOS app (xcodebuild)"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  SWIFT_OPTIMIZATION_LEVEL=-O \
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
if ! xcrun devicectl device install app --device "$UDID" "$APP_PATH"; then
  echo "ERROR: Install failed. The 7-day permission was NOT refreshed."
  echo "       Unlock the phone, leave it awake, and re-run."
  exit 1
fi

if ! app_is_on_phone "$UDID" "$BUNDLE_ID"; then
  echo "ERROR: $BUNDLE_ID is not on the phone after install."
  echo "       The 7-day permission was NOT refreshed."
  exit 1
fi

echo "==> Launching"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID" || {
  echo "(Launch failed — the app is installed, so the 7-day permission was refreshed."
  echo " Unlock the phone and tap the icon. If it is the first install, approve the"
  echo " developer in Settings > General > VPN & Device Management.)"
}

echo "==> Done (installed on phone)"
