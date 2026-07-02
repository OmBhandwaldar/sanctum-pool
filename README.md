# Sanctum Pool — A Compliant Privacy Pool on Stellar

> **Stellar Hacks: Real-World ZK** submission. Zero-knowledge privacy with *provable innocence*, built on Stellar's Protocol 25/26 native BN254 + Poseidon primitives.

**Status: 🚧 under active development (hackathon build in progress).**

## What it is

A shielded pool where you deposit a stablecoin and later withdraw to a **fresh, unlinkable address** — but **only** if your deposit belongs to a compliance-approved *association set* (ASP allow-list), and with a **view key** that lets you disclose a single transaction to an auditor without exposing anything else.

Pure mixers (Tornado Cash) get sanctioned because a criminal's tainted funds are indistinguishable from an honest user's. Fully transparent chains offer zero financial privacy. **Sanctum Pool fills the gap: privacy *with* provable innocence** — the compliant-privacy pattern Stellar's privacy strategy is built around.

## How the ZK is load-bearing

A withdrawal is **impossible** without a valid Groth16 zero-knowledge proof, verified on-chain in a Soroban contract using Stellar's **native BN254 `pairing_check`** host function. The proof simultaneously attests, revealing nothing about *which* deposit is yours:

1. your note's commitment is in the pool's state Merkle tree (native **Poseidon** hashing),
2. your note's compliance **label** is in the ASP-approved association set,
3. your revealed nullifier is correctly derived (no double-spend),
4. the withdrawal is bound to its recipient (anti-frontrunning).

## Architecture (target)

- **Circuits** (Circom 2 + snarkjs, Groth16 over BN254): `withdraw.circom` — dual Merkle membership + nullifier.
- **Soroban contracts** (Rust): `verifier` (BN254 Groth16), `pool` (deposits, on-chain Poseidon Merkle tree, nullifier set, fund custody), ASP root management, `token` (SEP-41 mock USDC).
- **Off-chain**: `asp-service` (compliance curator + approved-label Merkle tree), `client` CLI (note gen, proving, withdraw, view-key encrypt/decrypt, auditor reveal).

See [PLAN.md](PLAN.md) for the full build plan.

## What's real vs mocked

*(to be finalized as the build lands — this section will honestly state every simplification per the hackathon's requirements)*

- **Real:** the ZK circuits & Groth16 proofs, on-chain BN254 verification via native host functions, native-Poseidon Merkle tree, deposit→withdraw unlinkability, nullifier double-spend prevention, ASP gating, view-key selective disclosure.
- **Mocked / simplified:** ASP screening intelligence is an admin allow/deny toggle (not a live sanctions API); single asset, fixed denomination; single trusted ASP authority; testnet only; unaudited.

## License

MIT
