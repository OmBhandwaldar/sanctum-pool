#!/usr/bin/env bash
# Full Sanctum Pool demo on testnet:
#   1. Approved deposit (with on-chain encrypted note) -> ASP approval -> private withdrawal
#   2. Auditor selective disclosure: reveal ONE transaction and verify it against chain
#   3. Denied deposit: cannot build a valid withdrawal proof (ASP gating)
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
inv() { stellar contract invoke "$@" ; }

echo "== deploy verifier (nPublic=6 VK) =="
VERIFIER="$(stellar contract deploy --wasm target/wasm32v1-none/release/sanctum_verifier.wasm --network $NET 2>/dev/null | grep -Eo 'C[A-Z0-9]{55}' | tail -1)"
inv --id "$VERIFIER" --network $NET -- set_vk --vk_bytes "$("$CONV" vk circuits/keys/withdraw_vk.json)" >/dev/null
echo "verifier: $VERIFIER"; echo "$VERIFIER" > deployments/verifier_testnet.txt

echo "== token + recipient + pool =="
stellar contract asset deploy --asset native --network $NET >/dev/null 2>&1 || true
TOKEN="$(stellar contract id asset --asset native --network $NET)"
stellar keys generate recipient1 --network $NET --fund --overwrite >/dev/null 2>&1 || true
RECIP="$(stellar keys address recipient1)"; ADMIN="$(stellar keys address sanctum)"
POOL="$(stellar contract deploy --wasm target/wasm32v1-none/release/sanctum_pool.wasm --network $NET 2>/dev/null | grep -Eo 'C[A-Z0-9]{55}' | tail -1)"
echo "pool: $POOL"; echo "$POOL" > deployments/pool_testnet.txt
inv --id "$POOL" --network $NET -- init --verifier "$VERIFIER" --token "$TOKEN" \
  --admin "$ADMIN" --denom_amount 1000000 --denom_field 1000000 --scope 1 >/dev/null

echo ""; echo "########## 1. APPROVED PRIVATE PAYMENT ##########"
node client/src/genWithdrawInput.js 12345 approved >/dev/null
COMMIT="$(J commitment)"; ROOTV="$(J root)"; NH="$(J nullifierHash)"; RECF="$(J recipient)"
ASPROOT="$(J aspRoot)"; LABEL="$(J label)"; ENC="$(J encNote)"; DKEY="$(J disclosureKey)"

echo "-- deposit (commitment + on-chain encrypted note) --"
inv --id "$POOL" --network $NET -- deposit --from "$ADMIN" --commitment "$COMMIT" --enc_note "$ENC" >/dev/null
echo "-- post state root --"
inv --id "$POOL" --network $NET -- update_root --root "$ROOTV" >/dev/null
echo "-- ASP approves the deposit's label + admin posts ASP root --"
rm -f asp-service/approved.json; node asp-service/curator.js approve "$LABEL" >/dev/null
inv --id "$POOL" --network $NET -- update_asp_root --asp_root "$ASPROOT" >/dev/null

echo "-- prove + withdraw to a fresh, unlinkable address --"
node "$B/withdraw_js/generate_witness.js" "$B/withdraw_js/withdraw.wasm" "$B/withdraw_input.json" "$B/withdraw.wtns"
"$SNARK" groth16 prove "$B/withdraw_final.zkey" "$B/withdraw.wtns" "$B/proof.json" "$B/public.json" >/dev/null 2>&1
PROOF_HEX="$("$CONV" proof "$B/proof.json")"
BAL0="$(inv --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
inv --id "$POOL" --network $NET -- withdraw --proof_bytes "$PROOF_HEX" --nullifier_hash "$NH" \
  --root "$ROOTV" --asp_root "$ASPROOT" --recipient_field "$RECF" --recipient "$RECIP" >/dev/null
BAL1="$(inv --id "$TOKEN" --network $NET -- balance --id "$RECIP" 2>/dev/null)"
echo "   recipient balance: $BAL0 -> $BAL1  (private, ASP-compliant withdrawal OK)"

echo ""; echo "########## 2. AUDITOR SELECTIVE DISCLOSURE ##########"
ENC_ONCHAIN="$(inv --id "$POOL" --network $NET -- get_enc_note --commitment "$COMMIT" 2>/dev/null | tr -d '"')"
echo "-- auditor pulls the encrypted note from chain and is given ONE disclosure key --"
node client/src/auditorReveal.js "$ENC_ONCHAIN" "$DKEY" "$COMMIT"

echo ""; echo "########## 3. DENIED DEPOSIT (compliance gating) ##########"
node client/src/genWithdrawInput.js 12345 denied >/dev/null
if node "$B/withdraw_js/generate_witness.js" "$B/withdraw_js/withdraw.wasm" "$B/withdraw_input.json" "$B/withdraw_denied.wtns" >/dev/null 2>&1; then
  echo "ERROR: denied note produced a witness"; exit 1
else
  echo "   OK: a non-approved deposit cannot build a valid withdrawal proof"
fi

echo ""; echo "== SANCTUM POOL FULL E2E COMPLETE =="
echo "verifier=$VERIFIER"; echo "pool=$POOL"