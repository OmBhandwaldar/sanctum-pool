#!/usr/bin/env bash
# Groth16 trusted setup (BLS12-381) for a compiled circuit.
# Usage: scripts/setup_circuit.sh <circuit_name>   (run from repo root)
# Expects circuits/build/<name>.r1cs to exist.
set -euo pipefail

NAME="${1:-withdraw}"
POWER="${POWER:-14}"
BUILD="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/circuits/build"
cd "$BUILD"
export NODE_OPTIONS=--max-old-space-size=6144
SNARKJS="npx --yes snarkjs"

if [ ! -f pot_final.ptau ]; then
  echo "[ptau] new (bn128, 2^$POWER)"
  $SNARKJS powersoftau new bn128 "$POWER" pot_0.ptau
  $SNARKJS powersoftau contribute pot_0.ptau pot_1.ptau --name="sanctum-1" -e="$(head -c 64 /dev/urandom | base64)"
  echo "[ptau] prepare phase2"
  $SNARKJS powersoftau prepare phase2 pot_1.ptau pot_final.ptau
fi

echo "[groth16] setup"
$SNARKJS groth16 setup "$NAME.r1cs" pot_final.ptau "${NAME}_0.zkey"
$SNARKJS zkey contribute "${NAME}_0.zkey" "${NAME}_final.zkey" --name="sanctum-c2" -e="$(head -c 64 /dev/urandom | base64)"
$SNARKJS zkey export verificationkey "${NAME}_final.zkey" verification_key.json
echo "[done] ${NAME}_final.zkey + verification_key.json"
