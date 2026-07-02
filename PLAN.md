# PLAN.md — Sanctum Pool: A Compliant Privacy Pool on Stellar

> Build target for **Stellar Hacks: Real-World ZK** (DoraHacks). Deadline **2026-07-03 22:30** (~30 usable hours from now). Solo builder + Claude.
> **Execution note:** The first execution step is to copy this file verbatim to `/Users/omb/sanctum/stellar/PLAN.md` (repo root). This file (`~/.claude/plans/...`) is the planning copy.

---

## ⚑ DECISION LOG

**Step 1 — reproduced proven BLS12-381 reference (de-risk).** M0 confirmed Bachini `CircomStellar` (MIT) is BLS12-381 (earlier research wrongly said BN254). Reproduced end-to-end: proof verified `true` on testnet. This proved the toolchain works.

**Step 2 — pivoted the whole stack to BN254 (validated).** Rather than keep BLS12-381, ported the verifier + conversion tool to **BN254** and validated a proof verifies `true` on testnet (`CDCHDMIRXYO6TZOOMPGUW3CSE5DZCJZQCGNUUSO3WTMB3MY6I4EAZRXF`). Why BN254 wins overall:
- **Poseidon matching becomes free.** circomlibjs (BN254) ↔ circom `bn128` default ↔ native BN254 Poseidon host fn all share one field. Under BLS12-381 we'd have had to hand-roll a matching Poseidon in JS *and* on-chain — the bigger recurring risk (hits M1/M2/M3 witness gen + on-chain tree).
- **Best narrative:** BN254 is *the* Protocol 25/26 headline primitive the hackathon exists to showcase.
- **Verifier port was mechanical:** swap `crypto::bls12_381` → `crypto::bn254` (G1 64B / G2 128B).
- **Encoding footgun solved:** Stellar's BN254 host wants **big-endian** coords, G2 Fp2 as `be(c1)||be(c0)` (imaginary-first, EIP-197). Arkworks (LE, c0-first) was rejected with a flag-bit error; conversion tool now emits BE directly (no arkworks).
- **Verifier + proving:** Groth16 over **BN254** via `env.crypto().bn254().pairing_check`. Circuits compile with circom default (`bn128`). Proof = single pairing check.

---

## Context — why we're building this

The hackathon's entire thesis: Stellar's **Protocol 25 "X-Ray"** and **Protocol 26 "Yardstick"** added native **BN254** curve host functions and **Poseidon** hashing so that on-chain ZK proof verification is finally cheap. Organizers explicitly call **compliant privacy pools with ASP allow/deny lists** "the compliant-privacy sweet spot for real-world adoption," and selective disclosure via **view keys** is "the pattern Stellar's privacy strategy is built around." This project sits at the exact intersection of what wins here: **real-world money movement + compliance + the new primitives doing load-bearing work.**

**What we're building:** a shielded pool where you deposit a stablecoin and later withdraw to a *fresh, unlinkable address* — but **only** if your deposit is in a compliance-approved association set (ASP), and with a **view key** that lets you disclose one transaction to an auditor without exposing anything else. Pure mixers get sanctioned; transparent chains have no privacy. This fills the gap: **privacy with provable innocence.**

## Winning & judging alignment (design every decision around these)

- **ZK is load-bearing** (submission requirement): the withdrawal is impossible without a valid Groth16 proof of dual Merkle membership + nullifier. ✔
- **Touches Stellar meaningfully**: proofs verified on-chain in a Soroban contract on testnet, using the **new native BN254 `pairing_check` and Poseidon host functions** — the headline "we understood why this hackathon exists" signal. ✔
- **Real-world money movement**: confidential stablecoin payments with compliance + auditability — Stellar's core positioning. ✔
- **Submission deliverables**: (1) open-source repo + honest README, (2) 2–3 min demo video showing it working and explaining what the ZK does, (3) clear statement of what's real vs mocked.

## Key technical decisions (resolved from research)

| Decision | Choice | Why |
|---|---|---|
| Curve / proving system | **Groth16 over BN254** (Circom default `bn128`) | On-narrative: BN254 is the P25/P26 primitive. Cheap constant-size proof = single `pairing_check`. Working reference exists (Bachini `CircomStellar`). *(Nethermind's pool uses BLS12-381 — off-narrative — so we model the circuit design on it but do NOT reuse its verifier.)* |
| Note model | **Fixed-denomination** note, Privacy-Pools commitment shape | Simplest circuit that still composes with ASP + view key. Skips JoinSplit/partial-withdrawal. Also kills amount-correlation for free. |
| Commitment | `commitment = Poseidon(amount, label, Poseidon(nullifier, secret))` | Matches 0xbow/Privacy-Pools so ASP-label membership drops in cleanly. |
| On-chain Merkle tree | Incremental tree updated in-contract via **native Poseidon** host fn | Headline use of the P25 primitive; keeps the tree trustless. (Fallback below if param-matching stalls.) |
| Hashing | Poseidon over BN254 scalar field, **circomlib params**, matched to host `poseidon_permutation` | Circuit and contract must agree on constants (t, rounds_f, rounds_p, MDS, round constants). |
| View key | Independent X25519 viewing keypair; ECDH + XChaCha20-Poly1305 encrypted note blob in events | Railgun-style; ~a day; no circuit changes; enables per-tx disclosure. |
| ASP | Off-chain TS curator builds approved-label Merkle tree; admin-only `update_asp_root` on contract; store last N roots | Minimal viable ASP; single trusted authority for demo; decentralization = future work. |
| Demo surface | **CLI + one minimal web "auditor reveal" page** first → **full web dApp as stretch** | User's call. Core is testable/demoable fast; web dApp only after core is submittable. |
| Asset | Trivial **SEP-41 mock "USDC"** token we deploy (fallback: native XLM) | Better "stablecoin" story; XLM fallback removes a token contract if time is tight. |

## Cryptographic design (concrete)

```
label         = Poseidon(scope, nonce)                     // scope = pool/asset id (domain separation)
precommitment = Poseidon(nullifier, secret)                // nullifier, secret random Fr, client-side only
commitment    = Poseidon(amount, label, precommitment)     // leaf in the state tree
nullifierHash = Poseidon(nullifier)                        // public output; contract tracks spent set
```

**Withdrawal circuit** (`withdraw.circom`, fixed denomination, full withdrawal):
- **Public inputs:** `stateRoot`, `aspRoot`, `context` (binds recipient/fee → anti-frontrunning), `amount`.
- **Public outputs:** `nullifierHash`.
- **Private witnesses:** `nullifier`, `secret`, `scope`, `nonce`, `stateSiblings[]`, `stateIndex`, `aspSiblings[]`, `aspIndex`.
- **Constraints:**
  1. recompute `label`, `precommitment`, `commitment`;
  2. Merkle-prove `commitment` under `stateRoot`;
  3. Merkle-prove `label` under `aspRoot`;
  4. recompute and expose `nullifierHash`;
  5. bind `context` (e.g. `context * context` / include recipient) so a relayer can't malleate the recipient.

Private vs public: on-chain sees only commitment hashes, roots, nullifier hashes, the proof, and encrypted note blobs. Amounts (fixed/known), which deposit maps to which withdrawal, secrets, and real counterparties stay off-chain/device-only.

## Architecture

**Soroban contracts (Rust, `no_std`, target `wasm32v1-none`, SDK pinned to a P26 version):**
- `verifier` — Groth16 verify over BN254 via `env.crypto().bn254().pairing_check`. VK fixed at deploy. Modeled on Bachini `CircomStellar` (`set_vk` / `verify`).
- `pool` — holds funds; `deposit(commitment)` appends leaf to on-chain Poseidon Merkle tree + recent-roots ring buffer + emits event; `withdraw(proof, public_inputs, recipient)` calls verifier, checks `stateRoot` ∈ recent roots, checks `aspRoot` ∈ recent ASP roots, checks `nullifierHash` unspent, marks spent, releases funds.
- ASP state can live in `pool` or a small `entrypoint` module: `update_asp_root(root)` (auth: ASP admin only), stores last N ASP roots.
- `token` — minimal SEP-41 mock "USDC" (or use native XLM).

**Off-chain (TypeScript/Node):**
- `asp-service` — watches deposit events, extracts `label`, applies allow/deny policy (admin toggle for demo), maintains approved-label incremental Merkle tree (poseidon-lite, same params as circuit), calls `update_asp_root`, serves `{aspRoot, aspSiblings, aspIndex}` for a label.
- `client` (CLI) — note gen, deposit, build withdrawal witness (state + ASP paths), snarkjs prove, convert artifacts → Soroban hex, invoke `withdraw`; view-key encrypt/decrypt; auditor `reveal` helper.

**Circuit toolchain:** Circom 2 + snarkjs (Groth16, default bn128) → convert `verification_key.json`/`proof.json`/`public.json` to Soroban byte layout (G1=64B, G2=128B, Fr=32B; **watch G2 Fq2 limb order — the classic footgun**) via a small Rust `circom2soroban` helper (model on Bachini's `circom-to-soroban-hex`).

## Milestones (vertical-slice; each yields something demoable)

**M0a — Git + GitHub init (~20min).** `git init` in `/Users/omb/sanctum/stellar`; add `.gitignore` (Rust `target/`, `node_modules/`, snarkjs `*.ptau`/`*.zkey`/`*.wtns` build artifacts, keys/secrets); copy this plan to `PLAN.md`; write an initial `README.md` stub; create a **public** GitHub repo (via `gh repo create`) and push the first commit. Commit at the end of every milestone thereafter. *Exit: public repo exists with initial commit — satisfies the open-source submission requirement from hour zero.*

**M0 — Setup & de-risk the scariest part (~2h).** Install Stellar CLI, Rust `wasm32v1-none`, Circom+snarkjs+Node. Generate + fund testnet account (Friendbot). **Reproduce Bachini `CircomStellar` end-to-end on testnet** (known-good BN254 Circom→Groth16→Soroban verify). *Exit: a proof I generated verifies `true` on testnet.* This front-loads the highest-risk unknown.

**M1 — Core withdrawal circuit + on-chain verify (~6h).** Write `withdraw.circom` **without ASP first** (state inclusion + nullifier + context). circomlib Poseidon. Powers-of-tau + groth16 setup, prove, convert, deploy our `verifier` with fixed VK, verify a real proof on testnet. *Exit: our own privacy-pool withdrawal proof verifies on-chain.*

**M2 — Pool contract: deposit → withdraw vertical slice (~6h).** `pool` contract with on-chain Poseidon incremental Merkle tree + recent-roots buffer + nullifier set + fund custody (SEP-41 mock or XLM). CLI: deposit (commit + fund), then withdraw to a fresh address with a valid proof. *Exit: end-to-end confidential deposit→withdraw with unlinkability, no ASP yet — already a legitimate submission.*

**M3 — ASP compliance layer (~5h).** Add `label` to circuit + ASP-membership Merkle check (now dual-membership). `asp-service` curator + `update_asp_root` (admin-auth) + recent ASP roots. CLI demo: an **approved** deposit withdraws fine; a **denied** deposit's withdrawal proof fails (no valid ASP path). *Exit: compliant privacy pool working end-to-end.*

**M4 — View key / selective disclosure (~4h).** Client X25519 viewing keypair; on deposit/transfer, ECDH + XChaCha20-Poly1305 encrypt `{amount,label,recipient,blinding,nonce}` → post `(epk, ciphertext)` in event. Auditor `reveal` helper: given the single-tx shared secret, decrypt that one note and verify `commitment == Poseidon(...)` consistency. *Exit: "disclose one transaction to an auditor" works.*

**M5 — Minimal web reveal + demo assets (~4h).** One small web page for the **auditor reveal moment** (paste view key/secret → decrypt + show on-chain consistency ✔). Write README (honest real-vs-mocked, architecture diagram, run instructions). Script + record the **2–3 min demo video**. *Exit: submittable — repo + README + video + working testnet deployment.*

**M6 — Submit (~2h buffer).** Final testnet redeploy, freeze commit, push public repo, submit to DoraHacks. **Do this the moment M5 is green — never risk the deadline for polish.**

**M7 — STRETCH: full web dApp (only after M6 submitted).** Browser UI for deposit/withdraw/ASP-status/auditor with in-browser WASM proving. Re-record a nicer video if time remains and resubmit.

## Scope — real vs mocked (state this verbatim in README)

- **Real:** Circom circuits + Groth16 proofs; BN254 on-chain verification via native host functions; native-Poseidon on-chain Merkle tree; deposit→withdraw unlinkability; nullifier double-spend prevention; ASP dual-membership gating; view-key selective disclosure.
- **Mocked / simplified (disclosed):** ASP *screening intelligence* = admin allow/deny toggle (not a real sanctions API); single asset, fixed denomination; single trusted ASP authority; testnet only; no audit; ragequit/partial-withdrawals/multi-asset = future work.

## Risks & fallbacks

- **Poseidon param mismatch (circuit ↔ host).** Highest technical risk. *Fallback:* if host `poseidon_permutation` constants can't be matched to circomlib in time, maintain the Merkle tree off-chain and have the contract store/accept roots it received, OR use a Poseidon Rust impl compiled into the contract. (Prefer native for the narrative; keep fallback ready.)
- **G2 serialization / VK conversion footgun.** Mitigated by M0 reproducing a known-good BN254 verify before touching pool logic.
- **Soroban ~40% instruction budget per verification; ~7-day event retention.** Keep circuit tight (fixed denomination); index deposit events in `asp-service`/client rather than relying on RPC history.
- **Time overrun.** The plan is ordered so M2 (or M3) is already a valid submission; ASP, view key, web are additive. Submit early, enhance after.

## Verification / testing

- **Circuit:** snarkjs `groth16 verify` off-chain on every build; unit-test constraint failures (bad Merkle path, reused nullifier, wrong ASP path must all fail).
- **Contracts:** Soroban `#[test]` unit tests for deposit/withdraw/nullifier-reuse/ASP-root checks; then live `stellar contract invoke` on testnet.
- **End-to-end:** scripted demo — deposit → withdraw to fresh address (verify unlinkability on explorer) → denied deposit fails → auditor reveals one tx and consistency checks pass.
- **Submission check:** public repo builds from clean clone per README; video shows the ZK doing real work; real-vs-mocked stated.

## Repo structure (target)

```
sanctum/stellar/
  PLAN.md  README.md
  circuits/            # withdraw.circom, poseidon, merkle; build scripts (ptau, setup, prove)
  contracts/
    verifier/  pool/  token/        # Rust Soroban, no_std, wasm32v1-none
  tools/circom2soroban/             # Rust: snarkjs JSON -> Soroban hex
  asp-service/                      # TS curator + updateRoot + path server
  client/                          # TS/CLI: note gen, deposit, prove, withdraw, view-key, reveal
  web/                             # minimal auditor-reveal page (M5); full dApp (M7 stretch)
  scripts/  deployments/  STELLAR_*.txt (existing research)
```
