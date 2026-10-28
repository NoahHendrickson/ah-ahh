#!/bin/sh
# Archives the iPhone remote and uploads it to TestFlight.
# Needs an App Store Connect API key (App Manager role), saved as
#   ~/.appstoreconnect/private_keys/AuthKey_<KEY ID>.p8
# with its Issuer ID in ~/.appstoreconnect/issuer_id
set -eu
cd "$(dirname "$0")/../ios"

key=$(ls ~/.appstoreconnect/private_keys/AuthKey_*.p8 | head -1)
key_id=$(basename "$key" .p8 | sed 's/^AuthKey_//')
issuer=$(cat ~/.appstoreconnect/issuer_id)
auth="-allowProvisioningUpdates -authenticationKeyPath $key -authenticationKeyID $key_id -authenticationKeyIssuerID $issuer"

rm -rf build
# Every upload needs a higher build number than the last; the time always is.
xcodebuild archive -project AhAhhRemote.xcodeproj -scheme AhAhhRemote -destination generic/platform=iOS \
  -archivePath build/AhAhhRemote.xcarchive CURRENT_PROJECT_VERSION="$(date +%Y%m%d%H%M)" $auth
xcodebuild -exportArchive -archivePath build/AhAhhRemote.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build $auth
