#!/usr/bin/env bash
# Demo script: runs the full happy path via curl
# Usage: ./scripts/demo.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:3000/v1}"
echo "=== Amrutam Telemedicine Demo ==="
echo "Base URL: $BASE"
echo ""

# 1. Register a new patient
echo "── 1. Register patient ──"
REGISTER=$(curl -sf -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.patient@amrutam.test","password":"Demo@12345","firstName":"Demo","lastName":"Patient"}')
echo "$REGISTER" | python3 -m json.tool 2>/dev/null || echo "$REGISTER"
echo ""

# 2. Login as patient
echo "── 2. Login as patient ──"
LOGIN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.patient@amrutam.test","password":"Demo@12345"}')
echo "$LOGIN" | python3 -m json.tool 2>/dev/null || echo "$LOGIN"
PATIENT_TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access'])" 2>/dev/null || echo "")
echo ""

# 3. List available doctors
echo "── 3. Search doctors ──"
DOCTORS=$(curl -sf "$BASE/doctors?limit=1" \
  -H "Authorization: Bearer $PATIENT_TOKEN")
echo "$DOCTORS" | python3 -m json.tool 2>/dev/null || echo "$DOCTORS"
DOCTOR_ID=$(echo "$DOCTORS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "DOCTOR_ID_HERE")
echo "Doctor ID: $DOCTOR_ID"
echo ""

# 4. List available slots
echo "── 4. List slots ──"
FROM=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TO=$(date -u -d "+7 days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2026-11-09T00:00:00Z")
SLOTS=$(curl -sf "$BASE/doctors/$DOCTOR_ID/slots?from=$FROM&to=$TO&limit=1" \
  -H "Authorization: Bearer $PATIENT_TOKEN")
echo "$SLOTS" | python3 -m json.tool 2>/dev/null || echo "$SLOTS"
SLOT_ID=$(echo "$SLOTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "SLOT_ID_HERE")
echo "Slot ID: $SLOT_ID"
echo ""

# 5. Hold slot
echo "── 5. Hold slot (idempotency key: demo-hold-001) ──"
HOLD=$(curl -sf -X POST "$BASE/bookings/hold" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-hold-001" \
  -d "{\"slotId\":\"$SLOT_ID\"}")
echo "$HOLD" | python3 -m json.tool 2>/dev/null || echo "$HOLD"
HOLD_ID=$(echo "$HOLD" | python3 -c "import sys,json; print(json.load(sys.stdin)['holdId'])" 2>/dev/null || echo "HOLD_ID_HERE")
echo "Hold ID: $HOLD_ID"
echo ""

# 6. Confirm booking
echo "── 6. Confirm booking (creates payment intent) ──"
CONFIRM=$(curl -sf -X POST "$BASE/bookings/$HOLD_ID/confirm" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-confirm-001" \
  -d '{"paymentMethodToken":"tok_mock_visa"}')
echo "$CONFIRM" | python3 -m json.tool 2>/dev/null || echo "$CONFIRM"
PROVIDER_REF=$(echo "$CONFIRM" | python3 -c "import sys,json; print(json.load(sys.stdin)['providerRef'])" 2>/dev/null || echo "pi_mock_ref")
echo ""

# 7. Simulate webhook (payment captured)
echo "── 7. Simulate payment webhook ──"
PAYLOAD=$(python3 -c "
import json, hmac, hashlib, os, time, sys
secret = os.environ.get('PAYMENT_WEBHOOK_SECRET', 'dev-webhook-secret')
body = json.dumps({
    'id': 'evt_demo_001',
    'type': 'payment.captured',
    'data': {'object': {'id': '$PROVIDER_REF', 'status': 'captured', 'amount_cents': 50000}}
})
sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
print(body + '|' + sig)
" 2>/dev/null || echo "SKIP_WEBHOOK")

if [ "$PAYLOAD" != "SKIP_WEBHOOK" ]; then
  BODY=$(echo "$PAYLOAD" | cut -d'|' -f1)
  SIG=$(echo "$PAYLOAD" | cut -d'|' -f2)
  WEBHOOK=$(curl -sf -X POST "$BASE/payments/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Payment-Signature: $SIG" \
    -d "$BODY" || echo '{"note":"webhook auth error — check PAYMENT_WEBHOOK_SECRET"}')
  echo "$WEBHOOK" | python3 -m json.tool 2>/dev/null || echo "$WEBHOOK"
else
  echo "Python not available for HMAC — skipping webhook simulation"
fi
echo ""

echo "═══════════════════════════════════════"
echo "Demo complete! Full flow logged above."
echo ""
echo "Next steps:"
echo "  Doctor: POST $BASE/consultations/$HOLD_ID/start   (doctor JWT)"
echo "  Doctor: POST $BASE/consultations/$HOLD_ID/complete (doctor JWT)"
echo "  Doctor: POST $BASE/consultations/$HOLD_ID/prescriptions (doctor JWT)"
echo "  Admin:  GET  $BASE/audit"
echo "  Admin:  GET  $BASE/analytics/consultations"
