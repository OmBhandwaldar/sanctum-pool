#!/usr/bin/env bash
# End-to-end M3: compliant privacy pool with ASP gating.
#   approved note  -> deposit -> post state root -> ASP approves label -> withdraw OK
#   denied  note   -> cannot even build a proof (no valid ASP membership) -> blocked
set -euo pipefail
source "$HOME/.cargo/env"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
export STELLAR_ACCOUNT=sanctum
NET=testnet
SNARK="$ROOT/node_modules/.bin/snarkjs"
CONV="$ROOT/target/release/circom2soroban"
B="$ROOT/circuits/build"
J() { node -e "console.log(require('$B/withdraw_meta.json').$1)"; }

echo "== deploy verifier (nPublic=6 VK) =="
VERIFIER="$(stellar contract deploy --wasm target/wasm32v1-none/release/sanctum_verifier.wasm --network $NET 2>/dev/null | grep -Eo 'C[A-Z0-9]{55}' | tail -1)"
VK_HEX="$("$CONV" vk circuits/keys/withdraw_vk.json)"
stellar contract invoke --id "$VERIFIER" --network $NET -- set_vk --vk_bytes "$VK_HEX" >/dev/null
echo "verifier: $VERIFIER"; echo "$VERIFIER" > deployments/verifier_testnet.txt

echo "== token + recipient =="
stellar contract asset deploy --asset native --network $NET >/dev/null 2>&1 || true
TOKEN="$(stellar contract id asset --asset native --network $NET)"
stellar keys generate recipient1 --network $NET --fund --overwrite >/dev/null 2>&1 || true
RECIP="$(stellar keys address recipient1)"; ADMIN="$(stellar keys address sanctum)"

echo "== deploy + init pool =="
POOL="$(stellar contract deploy --wasm target/wasm32v1-none/release/sanctum_pool.wasm --network $NET 2>/dev/null | grep -Eo 'C[A-Z0-9]{55}' | tail -1)"
echo "pool: $POOL"; echo "$POOL" > deployments/pool_testnet.txt
stellar contract invoke --id "$POOL" --network $NET -- init \
  --verifier "$VERIFIER" --token "$TOKEN" --admin "$ADMIN" \
  --denom_amount 1000000 --denom_field 1000000 --scope 1 >/dev/null

echo ""
echo "########## APPROVED FLOW ##########"
node client/src/genWithdrawInput.js 12345 approved >/dev/null
COMMIT="$(J commitment)"; ROOTV="$(J root)"; NH="$(J nullifierHash)"; RECF="$(J recipient)"
ASPROOT="$(J aspRoot)"; LABEL="$(J label)"
echo "label: $LABEL"

echo "-- deposit --"
stellar contract invoke --id "$POOL" --network $NET -- deposit --from "$ADMIN" --commitment "$COMMIT" >/dev/null
echo "-- post state root --"
stellar contract invoke --id "$POOL" --network $NET -- update_root --root "$ROOTV" >/dev/null
echo "-- ASP approves label (curator) --"
rm -f asp-service/approved.json
node asp-service/curator.js approve "$LABEL"
echo "-- admin posts ASP root --"
stellar contract invoke --id "$POOL" --network $NET -- update_asp_root --asp_root "$ASPROOT" >/dev/null

echo "-- prove + withdraw --"
node "$B/withdraw_js/generate_witness.js" "$B/withdraw_js/withdraw.wasm" "$B/withdraw_input.json" "$B/withdraw.wtns"
"$SNARK" groth16 prove "$B/withdraw_final.zkey" "$B/withdraw.wtns" "$B/proof.json" "$B/public.json" >/dev/null 2>&1
PROOF_HEX="$("$CONV" proof "$B/proof.json")"
BAL0="$(stellar contract invoke --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
stellar contract invoke --id "$POOL" --network $NET -- withdraw \
  --proof_bytes "$PROOF_HEX" --nullifier_hash "$NH" --root "$ROOTV" \
  --asp_root "$ASPROOT" --recipient_field "$RECF" --recipient "$RECIP" >/dev/null
BAL1="$(stellar contract invoke --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
echo "recipient balance: $BAL0 -> $BAL1  (approved withdrawal OK)"

echo ""
echo "########## DENIED FLOW ##########"
node client/src/genWithdrawInput.js 12345 denied >/dev/null
echo "-- attempt to build proof for a NON-approved label --"
if node "$B/withdraw_js/generate_witness.js" "$B/withdraw_js/withdraw.wasm" "$B/withdraw_input.json" "$B/withdraw_denied.wtns" >/dev/null 2>&1; then
  echo "ERROR: denied note produced a witness (should be impossible)"; exit 1
else
  echo "OK: non-approved deposit cannot build a valid withdrawal proof (ASP gating enforced by the circuit)"
fi

echo ""
echo "== M3 E2E COMPLETE =="
