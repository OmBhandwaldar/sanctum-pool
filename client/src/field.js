// BN254 scalar field helpers (matches circom bn128 + circomlibjs Poseidon).
// Uses the Web Crypto API (available in Node 18+ and browsers) so the same
// modules run in the CLI and in the web reveal page.

// BN254 scalar field modulus r.
export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// A uniformly-random field element (rejection-free: reduce 32 random bytes).
export function randomField() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return BigInt("0x" + hex) % FIELD;
}

export function toDec(x) {
  return (typeof x === "bigint" ? x : BigInt(x)).toString(10);
}
