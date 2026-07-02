// Derive the field element the pool binds a withdrawal to, from a Stellar
// address strkey. MUST match SanctumPool::recipient_field on-chain:
//   first 31 bytes (big-endian) of SHA-256(strkey-ascii-bytes).
import { sha256 } from "@noble/hashes/sha2.js";

export function recipientField(strkey) {
  const digest = sha256(new TextEncoder().encode(strkey));
  let x = 0n;
  for (let i = 0; i < 31; i++) x = (x << 8n) | BigInt(digest[i]);
  return x;
}
