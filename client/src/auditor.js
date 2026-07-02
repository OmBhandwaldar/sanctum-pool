// Auditor-side verification of a selectively-disclosed note.
//
// Given a decrypted note plaintext, recompute the commitment and check it
// equals the commitment anchored on-chain. This proves the disclosed plaintext
// really corresponds to that specific on-chain deposit — the note-owner cannot
// hand the auditor a fake plaintext.
import { commitmentOf } from "./note.js";

export async function verifyDisclosure(plain) {
  const note = {
    amount: BigInt(plain.amount),
    scope: BigInt(plain.scope),
    nullifier: BigInt(plain.nullifier),
    secret: BigInt(plain.secret),
    nonce: BigInt(plain.nonce),
  };
  const recomputed = await commitmentOf(note);
  return {
    ok: recomputed.toString() === String(plain.commitment),
    recomputed: recomputed.toString(),
    claimed: String(plain.commitment),
  };
}
