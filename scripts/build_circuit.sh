#!/usr/bin/env bash
# Compile a circuit to r1cs + wasm (BN254 / circom default bn128).
# Usage: scripts/build_circuit.sh [circuit_name]   (run from repo root)
set -euo pipefail
NAME="${1:-withdraw}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/circuits"
mkdir -p build
circom "$NAME.circom" --r1cs --wasm --sym \
  -l "$ROOT/node_modules/circomlib/circuits" -o build
echo "[done] circuits/build/$NAME.{r1cs,wasm,sym}"
