// View-key selective disclosure (Railgun/Zcash-style).
//
// Each user has an X25519 *viewing* keypair, independent of any spending
// authority. A note's plaintext is encrypted to the recipient's viewing pubkey
// via ECDH + XChaCha20-Poly1305 and anchored on-chain next to the commitment.
//
//   shared = X25519(ephemeralSecret, recipientViewPub)
//   key    = SHA256(shared)
//   ct     = XChaCha20Poly1305(key, cnonce).encrypt(utf8(JSON(note)))
//   blob   = { epk, cnonce, ct }
//
// Selective disclosure: revealing `key` (per-transaction) lets an auditor
// decrypt exactly that one note — not the user's whole history (which sharing
// the viewing secret would expose) and never any spending capability.
import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

function rand(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function genViewKeypair() {
  const vsk = rand(32);
  const vpk = x25519.getPublicKey(vsk);
  return { vsk: bytesToHex(vsk), vpk: bytesToHex(vpk) };
}

// note: plain object with string/number fields. recipientVpkHex: viewing pubkey.
export function encryptNote(note, recipientVpkHex) {
  const esk = rand(32);
  const epk = x25519.getPublicKey(esk);
  const shared = x25519.getSharedSecret(esk, hexToBytes(recipientVpkHex));
  const key = sha256(shared);
  const cnonce = rand(24);
  const pt = utf8ToBytes(JSON.stringify(note));
  const ct = xchacha20poly1305(key, cnonce).encrypt(pt);
  return {
    blob: { epk: bytesToHex(epk), cnonce: bytesToHex(cnonce), ct: bytesToHex(ct) },
    // per-transaction disclosure key (hex); share ONLY this to reveal one note
    disclosureKey: bytesToHex(key),
  };
}

function decryptWithKey(blob, key) {
  const pt = xchacha20poly1305(key, hexToBytes(blob.cnonce)).decrypt(
    hexToBytes(blob.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

// Recipient/owner decrypts using their viewing secret.
export function decryptWithViewKey(blob, vskHex) {
  const shared = x25519.getSharedSecret(hexToBytes(vskHex), hexToBytes(blob.epk));
  return decryptWithKey(blob, sha256(shared));
}

// Auditor decrypts a single disclosed transaction using the revealed key.
export function decryptWithDisclosureKey(blob, disclosureKeyHex) {
  return decryptWithKey(blob, hexToBytes(disclosureKeyHex));
}

// Serialize a blob to a compact on-chain byte string: epk(32)|cnonce(24)|ct.
export function blobToHex(blob) {
  return blob.epk + blob.cnonce + blob.ct;
}
export function blobFromHex(hex) {
  return { epk: hex.slice(0, 64), cnonce: hex.slice(64, 112), ct: hex.slice(112) };
}
