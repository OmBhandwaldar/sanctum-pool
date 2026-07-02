// In-browser Groth16 proving. snarkjs.fullProve runs entirely client-side, so
// the note secret never leaves the device. In the browser, wasm/zkey are given
// as URLs (snarkjs fetches them); in Node they can be file paths — the proving
// code path is identical, which is what lets us de-risk it under Node first.
import * as snarkjs from "snarkjs";

export const WASM_URL = "/circuits/withdraw.wasm";
export const ZKEY_URL = "/circuits/withdraw_final.zkey";

// input: the withdraw witness object (see client/src/genWithdrawInput.js).
// onStep: optional (step: "witness"|"proving"|"done") => void
export async function proveWithdraw(input, onStep, wasm = WASM_URL, zkey = ZKEY_URL) {
  onStep?.("witness");
  // fullProve computes the witness then the proof; snarkjs emits its own log,
  // we surface coarse steps for the UI.
  onStep?.("proving");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  onStep?.("done");
  return { proof, publicSignals };
}

export async function verifyLocally(vk, publicSignals, proof) {
  return snarkjs.groth16.verify(vk, publicSignals, proof);
}
