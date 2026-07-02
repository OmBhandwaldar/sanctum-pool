// Sanctum note scheme (must match circuits/withdraw.circom):
//   precommitment = Poseidon(nullifier, secret)
//   label         = Poseidon(scope, nonce)
//   commitment    = Poseidon(amount, label, precommitment)
//   nullifierHash = Poseidon(nullifier)
import { poseidon } from "./poseidon.js";
import { randomField } from "./field.js";

// Fixed pool config (single denomination for the hackathon build).
export const AMOUNT = 1000000n; // 1.000000 units (6 decimals)
export const SCOPE = 1n; // pool/asset domain separator

// Create a fresh random note.
export function createNote({ amount = AMOUNT, scope = SCOPE } = {}) {
  return {
    amount,
    scope,
    nullifier: randomField(),
    secret: randomField(),
    nonce: randomField(),
  };
}

export async function labelOf(note) {
  return poseidon([note.scope, note.nonce]);
}

export async function commitmentOf(note) {
  const pre = await poseidon([note.nullifier, note.secret]);
  const label = await labelOf(note);
  return poseidon([note.amount, label, pre]);
}

export async function nullifierHashOf(note) {
  return poseidon([note.nullifier]);
}
