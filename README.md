# Sanctum Pool — A Compliant Privacy Pool on Stellar

> **Stellar Hacks: Real-World ZK** submission. Zero-knowledge privacy with *provable innocence*, built on Stellar's Protocol 25/26 native **BN254** + **Poseidon** primitives.

Deposit a token, withdraw to a **fresh, unlinkable address** — but only if your deposit belongs to a compliance-approved **association set (ASP)**, and with a **view key** that lets you disclose a single transaction to an auditor without exposing anything else.

Pure mixers (Tornado Cash) get sanctioned because a criminal's tainted funds are indistinguishable from an honest user's. Fully-transparent chains offer zero financial privacy. **Sanctum Pool fills the gap: privacy *with* provable innocence** — the compliant-privacy pattern Stellar's privacy strategy is built around.

---

## What the ZK actually does (load-bearing)

A withdrawal is **impossible** without a valid Groth16 zero-knowledge proof, verified **on-chain** in a Soroban contract using Stellar's native **BN254 `pairing_check`** host function. In one proof, revealing *nothing* about which deposit is yours, the withdrawer proves:

1. **State membership** — the note's commitment is a leaf in the pool's state Merkle tree (`root`).
2. **Compliance membership** — the note's `label` is a leaf in the ASP-approved association set (`aspRoot`).
3. **No double-spend** — a correctly-derived `nullifierHash` is revealed (tracked on-chain).
4. **Recipient binding** — the recipient is bound into the proof (anti-frontrunning).

If a deposit is **not** in the approved set, the circuit simply cannot produce a satisfying witness — so non-approved funds can never be privately withdrawn.

### Note scheme

```
precommitment = Poseidon(nullifier, secret)
label         = Poseidon(scope, nonce)
commitment    = Poseidon(amount, label, precommitment)   # leaf in state tree
nullifierHash = Poseidon(nullifier)                       # public, prevents double-spend
```

Public signals (fixed by the circuit): `[nullifierHash, root, aspRoot, recipient, amount, scope]`.

---

## Live on Stellar testnet

| Component | Contract ID |
|---|---|
| Verifier (Groth16 / BN254) | `CAVZB37I2YHUINDZDQJ6OGDWHL43IN3GLT7SB3HX6KOUNIBQ4BC3R7AO` |
| Pool | `CDNHJZUGZL7RHVMXFLOENWXQQOYIB2NGLGXN5AQP5OCES57XWWBN7VU6` |

(Latest IDs are always in [`deployments/`](deployments/). Re-run `scripts/e2e.sh` to deploy your own.)

---

## Architecture

```
                    ┌─────────────────────────── off-chain (client) ───────────────────────────┐
  deposit:  note ─► commitment (Poseidon) ─► encrypt note to auditor view key (X25519+XChaCha20)
  withdraw: build Groth16 proof (circom + snarkjs, BN254): state + ASP membership + nullifier
                    └───────────────────────────────────────────────────────────────────────────┘
                                                    │ proof, roots, nullifierHash, enc-note
                                                    ▼
   ┌──────────────── Soroban (Rust, no_std) ────────────────┐        ┌─── ASP curator (off-chain) ───┐
   │  pool:  deposit / withdraw / nullifier set / recent     │◄──────►│  approves labels, publishes    │
   │         roots / anchored encrypted notes                │  root  │  association-set Merkle root    │
   │  verifier:  Groth16 over native BN254 pairing_check      │        └────────────────────────────────┘
   └─────────────────────────────────────────────────────────┘
```

- **`circuits/`** — `withdraw.circom` (dual Merkle membership + nullifier + recipient binding), `merkle.circom` (Poseidon Merkle). Groth16 over BN254.
- **`contracts/verifier/`** — Groth16 verifier using `env.crypto().bn254().pairing_check` (Protocol 25/26).
- **`contracts/pool/`** — deposits, withdrawals, nullifier set, recent state/ASP roots, on-chain encrypted-note anchoring, fund custody.
- **`tools/circom2soroban/`** — converts snarkjs JSON proofs/keys into the BN254 byte layout the host expects (big-endian; G2 Fp2 as `be(c1)||be(c0)`).
- **`client/`** — note generation, Poseidon Merkle trees, witness input, view-key encryption, auditor reveal.
- **`asp-service/`** — the ASP curator: maintains the approved-label set and its Merkle root.

---

## Run it

Prereqs: Rust + `wasm32v1-none`, Stellar CLI, circom 2, Node 18+, and a funded testnet identity named `sanctum` (`stellar keys generate sanctum --network testnet --fund`).

```bash
# install JS deps
npm install && (cd client && npm install)

# build the circuit + trusted setup (or use committed keys in circuits/keys/)
scripts/build_circuit.sh withdraw
scripts/setup_circuit.sh  withdraw

# build contracts
stellar contract build
cargo build -p circom2soroban --release

# run the full end-to-end demo on testnet
scripts/e2e.sh
```

`scripts/e2e.sh` performs, on testnet: an approved private payment → an auditor selective-disclosure that verifies against chain → a denied deposit that cannot build a proof.

---

## What's real vs mocked (honest disclosure)

**Real (load-bearing):**
- Circom circuits + Groth16 proofs; **on-chain BN254 verification** via native host functions.
- Deposit → withdraw **unlinkability**; **nullifier** double-spend prevention (enforced on-chain).
- **ASP dual-membership** gating — non-approved deposits provably cannot withdraw (enforced *inside the circuit*).
- **View-key selective disclosure** — encrypted notes anchored on-chain; an auditor decrypts exactly one transaction and verifies it against the on-chain commitment.

**Mocked / simplified (clearly scoped for the hackathon):**
- **ASP screening intelligence** is a manual admin allow/deny toggle, not a live sanctions/AML API. (The *mechanism* that enforces approval is real; only the decision source is mocked.)
- **State-tree root** is derived from the on-chain commitment list and **posted by an admin ("sequencer")** rather than recomputed on-chain. Anyone can re-derive and check it. Computing the Merkle root on-chain with the native **Poseidon** host function is the natural next step (see below).
- **Single asset, fixed denomination**; single trusted ASP authority; testnet only; unaudited.
- Recipient is bound *inside the proof* but not yet re-derived from the destination address on-chain (no relayer is used in the demo).

---

## Why BN254 (and a note on the primitives)

We verify Groth16 proofs on-chain with Stellar's **native BN254 `pairing_check`** (Protocol 25/26 — the headline primitives this hackathon exists to showcase). BN254 is also circom's default curve, so the same field is shared across the circuit, the JS client (circomlibjs Poseidon), and the on-chain verifier — no cross-field glue. The snarkjs→Soroban byte conversion had one footgun: the host wants **big-endian** coordinates with G2 Fp2 encoded imaginary-part-first (`be(c1)||be(c0)`, EIP-197), not arkworks' little-endian.

## Future work
- Compute the state-tree root **on-chain** with the native **Poseidon** host function (fully trustless tree).
- Decentralize the ASP; real screening integrations.
- Multi-asset + variable amounts (JoinSplit/UTXO notes); on-chain recipient binding; audit.

## Credits & license
MIT. The Groth16 verifier and the snarkjs→Soroban converter are adapted from [CircomStellar](https://github.com/jamesbachini/CircomStellar) (MIT). Design references: the Privacy Pools whitepaper, 0xbow privacy-pools-core, Nethermind's stellar-private-payments, and Railgun/Zcash viewing keys. See [`NOTICE`](NOTICE).
