#!/usr/bin/env bash
# Enable Cloudflare Email Routing on zapbar.app and forward
# support@zapbar.app -> <developer-email>.
# Destination addresses require a one-time verification click by the owner.
set -euo pipefail

CF_ENV="$HOME/.config/claudify/cloudflare.env"
# shellcheck disable=SC1090
source "$CF_ENV"
ZONE="9544fcdb703efae5d321114afd266fac" # zapbar.app
DEST="${DEST:?set DEST to the forwarding address}"
ALIAS="support@zapbar.app"
CF="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")

echo "== enable routing (adds MX/SPF records) =="
curl -sS -X POST "${CF}/zones/${ZONE}/email/routing/enable" "${AUTH[@]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  enable:', 'ok' if d.get('success') else d.get('errors'))"

echo "== destination address =="
curl -sS -X POST "${CF}/accounts/${CF_ACCOUNT_ID}/email/routing/addresses" "${AUTH[@]}" \
  -d "{\"email\":\"${DEST}\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);e=d.get('errors') or [];print('  destination:', 'created (verification mail sent)' if d.get('success') else e)"

echo "== forwarding rule =="
curl -sS -X POST "${CF}/zones/${ZONE}/email/routing/rules" "${AUTH[@]}" \
  -d "{\"name\":\"support forward\",\"enabled\":true,\"matchers\":[{\"type\":\"literal\",\"field\":\"to\",\"value\":\"${ALIAS}\"}],\"actions\":[{\"type\":\"forward\",\"value\":[\"${DEST}\"]}]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);e=d.get('errors') or [];print('  rule:', 'ok' if d.get('success') else e)"

echo "== status =="
curl -sS "${CF}/zones/${ZONE}/email/routing" "${AUTH[@]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['result'];print('  routing:', d.get('status'), '| enabled:', d.get('enabled'))"
