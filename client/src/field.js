// BN254 scalar field helpers (matches circom bn128 + circomlibjs Poseidon).
import { randomBytes } from "crypto";

// BN254 scalar field modulus r.
export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// A uniformly-random field element (rejection-free: reduce 32 random bytes).
export function randomField() {
  const hex = randomBytes(32).toString("hex");
  return BigInt("0x" + hex) % FIELD;
}

export function toDec(x) {
  return (typeof x === "bigint" ? x : BigInt(x)).toString(10);
}
