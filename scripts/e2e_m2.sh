#!/usr/bin/env bash
# End-to-end M2: deposit -> post root -> prove -> withdraw on testnet.
# Requires: verifier already deployed with the withdraw VK (deployments/verifier_testnet.txt).
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

VERIFIER="$(cat deployments/verifier_testnet.txt)"
echo "verifier: $VERIFIER"

echo "== native token SAC =="
stellar contract asset deploy --asset native --network $NET >/dev/null 2>&1 || true
TOKEN="$(stellar contract id asset --asset native --network $NET)"
echo "token: $TOKEN"

echo "== recipient identity =="
stellar keys generate recipient1 --network $NET --fund --overwrite >/dev/null 2>&1 || true
RECIP="$(stellar keys address recipient1)"
echo "recipient: $RECIP"

echo "== deploy pool =="
POOL="$(stellar contract deploy --wasm target/wasm32v1-none/release/sanctum_pool.wasm --network $NET 2>/dev/null | grep -Eo 'C[A-Z0-9]{55}' | tail -1)"
echo "pool: $POOL"; echo "$POOL" > deployments/pool_testnet.txt
ADMIN="$(stellar keys address sanctum)"

echo "== init pool (denom 0.1 XLM = 1000000 stroops, field 1000000, scope 1) =="
stellar contract invoke --id "$POOL" --network $NET -- init \
  --verifier "$VERIFIER" --token "$TOKEN" --admin "$ADMIN" \
  --denom_amount 1000000 --denom_field 1000000 --scope 1 >/dev/null
echo "initialized"

echo "== generate note + witness input =="
node client/src/genWithdrawInput.js >/dev/null
COMMIT="$(J commitment)"; ROOTV="$(J root)"; NH="$(J nullifierHash)"; RECF="$(J recipient)"
echo "commitment: $COMMIT"
echo "root:       $ROOTV"

echo "== deposit =="
stellar contract invoke --id "$POOL" --network $NET -- deposit --from "$ADMIN" --commitment "$COMMIT" >/dev/null
echo "deposited"

echo "== post state root (admin) =="
stellar contract invoke --id "$POOL" --network $NET -- update_root --root "$ROOTV" >/dev/null
echo "root posted; is_known_root: $(stellar contract invoke --id "$POOL" --network $NET -- is_known_root --root "$ROOTV" 2>/dev/null)"

echo "== prove =="
node "$B/withdraw_js/generate_witness.js" "$B/withdraw_js/withdraw.wasm" "$B/withdraw_input.json" "$B/withdraw.wtns"
"$SNARK" groth16 prove "$B/withdraw_final.zkey" "$B/withdraw.wtns" "$B/proof.json" "$B/public.json" >/dev/null 2>&1
PROOF_HEX="$("$CONV" proof "$B/proof.json")"

echo "== recipient balance BEFORE =="
BAL0="$(stellar contract invoke --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
echo "before: $BAL0"

echo "== withdraw =="
stellar contract invoke --id "$POOL" --network $NET -- withdraw \
  --proof_bytes "$PROOF_HEX" --nullifier_hash "$NH" --root "$ROOTV" \
  --recipient_field "$RECF" --recipient "$RECIP" >/dev/null
echo "withdrawn"

echo "== recipient balance AFTER =="
BAL1="$(stellar contract invoke --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
echo "after:  $BAL1"
echo "== double-spend must fail =="
if stellar contract invoke --id "$POOL" --network $NET -- withdraw \
  --proof_bytes "$PROOF_HEX" --nullifier_hash "$NH" --root "$ROOTV" \
  --recipient_field "$RECF" --recipient "$RECIP" >/dev/null 2>&1; then
  echo "ERROR: double-spend succeeded!"; exit 1
else
  echo "OK: double-spend rejected"
fi
echo "== M2 E2E COMPLETE =="
