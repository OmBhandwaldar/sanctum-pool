use num_bigint::BigUint;
use serde::Deserialize;
use std::fs;

// Stellar's BN254 host expects (bn254.rs docs):
//   G1: be_bytes(X) || be_bytes(Y)                 (32 + 32)
//   G2: Fp2 encoded as be_bytes(c1) || be_bytes(c0);
//       point = be(x.c1) || be(x.c0) || be(y.c1) || be(y.c0)   (imaginary first, EIP-197)
// snarkjs emits Fp2 coordinates as [c0, c1] in decimal strings.

#[derive(Deserialize)]
struct VerificationKeyJson {
    vk_alpha_1: [String; 3],
    vk_beta_2: [[String; 2]; 3],
    vk_gamma_2: [[String; 2]; 3],
    vk_delta_2: [[String; 2]; 3],
    #[serde(rename = "IC")]
    ic: Vec<[String; 3]>,
    #[serde(rename = "nPublic")]
    n_public: usize,
}

#[derive(Deserialize)]
struct ProofJson {
    pi_a: [String; 3],
    pi_b: [[String; 2]; 3],
    pi_c: [String; 3],
}

type PublicSignalsJson = Vec<String>;

// 32-byte big-endian encoding of a decimal field-element string.
fn fp_be(s: &str) -> [u8; 32] {
    parse_u256_be(s)
}

// G1 point: be(X) || be(Y).
fn g1_bytes(x: &str, y: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(64);
    out.extend(fp_be(x));
    out.extend(fp_be(y));
    out
}

// G2 point from snarkjs Fp2 pairs x = (x_c0, x_c1), y = (y_c0, y_c1).
// Host wants imaginary part first: be(x_c1)||be(x_c0)||be(y_c1)||be(y_c0).
fn g2_bytes(x_c0: &str, x_c1: &str, y_c0: &str, y_c1: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(128);
    out.extend(fp_be(x_c1));
    out.extend(fp_be(x_c0));
    out.extend(fp_be(y_c1));
    out.extend(fp_be(y_c0));
    out
}

fn parse_u256_be(signal: &str) -> [u8; 32] {
    let n = BigUint::parse_bytes(signal.as_bytes(), 10).expect("invalid public signal");
    let mut raw = n.to_bytes_be();
    if raw.len() > 32 {
        panic!("public signal exceeds 256 bits");
    }
    if raw.len() < 32 {
        let mut padded = vec![0u8; 32 - raw.len()];
        padded.append(&mut raw);
        raw = padded;
    }
    raw.try_into().expect("invalid 32-byte conversion")
}

fn vk_hex(path: &str) -> String {
    let src = fs::read_to_string(path).expect("failed to read vk json");
    let vk: VerificationKeyJson = serde_json::from_str(&src).expect("invalid vk json");

    if vk.ic.len() != vk.n_public + 1 {
        panic!("IC length does not match nPublic + 1");
    }

    let mut out = Vec::new();
    out.extend(g1_bytes(&vk.vk_alpha_1[0], &vk.vk_alpha_1[1]));
    out.extend(g2_bytes(
        &vk.vk_beta_2[0][0],
        &vk.vk_beta_2[0][1],
        &vk.vk_beta_2[1][0],
        &vk.vk_beta_2[1][1],
    ));
    out.extend(g2_bytes(
        &vk.vk_gamma_2[0][0],
        &vk.vk_gamma_2[0][1],
        &vk.vk_gamma_2[1][0],
        &vk.vk_gamma_2[1][1],
    ));
    out.extend(g2_bytes(
        &vk.vk_delta_2[0][0],
        &vk.vk_delta_2[0][1],
        &vk.vk_delta_2[1][0],
        &vk.vk_delta_2[1][1],
    ));

    out.extend((vk.ic.len() as u32).to_be_bytes());
    for point in vk.ic {
        out.extend(g1_bytes(&point[0], &point[1]));
    }

    hex::encode(out)
}

fn proof_hex(path: &str) -> String {
    let src = fs::read_to_string(path).expect("failed to read proof json");
    let proof: ProofJson = serde_json::from_str(&src).expect("invalid proof json");

    let mut out = Vec::new();
    out.extend(g1_bytes(&proof.pi_a[0], &proof.pi_a[1]));
    out.extend(g2_bytes(
        &proof.pi_b[0][0],
        &proof.pi_b[0][1],
        &proof.pi_b[1][0],
        &proof.pi_b[1][1],
    ));
    out.extend(g1_bytes(&proof.pi_c[0], &proof.pi_c[1]));

    hex::encode(out)
}

fn public_hex(path: &str) -> String {
    let src = fs::read_to_string(path).expect("failed to read public json");
    let signals: PublicSignalsJson = serde_json::from_str(&src).expect("invalid public json");

    let mut out = Vec::new();
    out.extend((signals.len() as u32).to_be_bytes());
    for s in signals {
        out.extend(parse_u256_be(&s));
    }

    hex::encode(out)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let kind = args
        .next()
        .expect("usage: circom-to-soroban-hex <vk|proof|public> <json-file>");
    let path = args
        .next()
        .expect("usage: circom-to-soroban-hex <vk|proof|public> <json-file>");

    let hex = match kind.as_str() {
        "vk" => vk_hex(&path),
        "proof" => proof_hex(&path),
        "public" => public_hex(&path),
        _ => panic!("unknown kind: {kind}"),
    };

    println!("{hex}");
}
