#!/usr/bin/env bash
# Uploads the app + Detox app client to BrowserStack and prints export lines.
# Usage: eval "$(./scripts/bs-upload.sh path/to/app.apk path/to/app-androidTest.apk)"
set -euo pipefail

APP="${1:?usage: bs-upload.sh <app.apk|aab> <app-client.apk>}"
CLIENT="${2:?usage: bs-upload.sh <app.apk|aab> <app-client.apk>}"
: "${BROWSERSTACK_USERNAME:?set BROWSERSTACK_USERNAME}"
: "${BROWSERSTACK_ACCESS_KEY:?set BROWSERSTACK_ACCESS_KEY}"

API="https://api-cloud.browserstack.com/app-automate/detox/v2/android"
AUTH="$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY"

json_field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j['$1']){console.error(s);process.exit(1)}console.log(j['$1'])})"; }

APP_URL=$(curl -sS -u "$AUTH" -X POST "$API/app" -F "file=@$APP" | json_field app_url)
CLIENT_URL=$(curl -sS -u "$AUTH" -X POST "$API/app-client" -F "file=@$CLIENT" | json_field app_client_url)

echo "export BROWSERSTACK_APP_URL=$APP_URL"
echo "export BROWSERSTACK_APP_CLIENT_URL=$CLIENT_URL"
