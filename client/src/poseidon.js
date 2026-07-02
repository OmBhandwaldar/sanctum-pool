// Poseidon over BN254 via circomlibjs — the SAME parameterization circomlib's
// circuit uses, so hashes computed here match the withdraw circuit and the
// native BN254 Poseidon host function on-chain.
import { buildPoseidon } from "circomlibjs";

let _poseidon = null;

export async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

// Hash an array of bigint/string/number inputs -> bigint field element.
export async function poseidon(inputs) {
  const p = await getPoseidon();
  const out = p(inputs.map((x) => BigInt(x)));
  return BigInt(p.F.toString(out)); // F.toString returns decimal
}
