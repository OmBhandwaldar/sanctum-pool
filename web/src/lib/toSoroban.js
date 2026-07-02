// JS port of tools/circom2soroban — converts snarkjs Groth16 JSON into the
// exact byte layout Stellar's BN254 verifier expects:
//   field  : 32-byte big-endian
//   G1     : be(x) || be(y)                                  (64)
//   G2     : be(x.c1) || be(x.c0) || be(y.c1) || be(y.c0)    (128, imaginary-first)
//   public : u32-be(len) || be(sig)...
// snarkjs emits Fp2 coordinate pairs as [c0, c1].

function fpBE(dec) {
  let x = BigInt(dec);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function u32BE(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concat(parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const g1 = (p) => concat([fpBE(p[0]), fpBE(p[1])]);
// p = [[x_c0, x_c1], [y_c0, y_c1], [1, 0]]
const g2 = (p) => concat([fpBE(p[0][1]), fpBE(p[0][0]), fpBE(p[1][1]), fpBE(p[1][0])]);

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function vkHex(vk) {
  const parts = [g1(vk.vk_alpha_1), g2(vk.vk_beta_2), g2(vk.vk_gamma_2), g2(vk.vk_delta_2)];
  parts.push(u32BE(vk.IC.length));
  for (const ic of vk.IC) parts.push(g1(ic));
  return toHex(concat(parts));
}

export function proofHex(proof) {
  return toHex(concat([g1(proof.pi_a), g2(proof.pi_b), g1(proof.pi_c)]));
}

export function publicHex(publicSignals) {
  const parts = [u32BE(publicSignals.length)];
  for (const s of publicSignals) parts.push(fpBE(s));
  return toHex(concat(parts));
}
