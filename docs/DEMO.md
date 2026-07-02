# Sanctum Pool — Demo Guide & Video Script

A 2–3 minute walkthrough. You don't need to appear on camera — screen recording + voiceover is enough. The whole live demo is one command plus one web page.

## Setup before recording

```bash
# from repo root, with a funded testnet identity `sanctum`
npm install && (cd client && npm install) && (cd web && npm install)
stellar contract build && cargo build -p circom2soroban --release
```

Have two things ready to show:
1. A terminal to run `scripts/e2e.sh`.
2. The web reveal page: `cd web && npx vite` → open the printed localhost URL.

---

## Video script (~2:30)

**[0:00–0:20] The problem.**
> "On a transparent blockchain, every payment is public. Plain mixers fix that but get sanctioned, because a criminal's coins look identical to an honest user's. Sanctum Pool is a privacy pool on Stellar that gives you privacy *with* provable innocence — and it verifies real zero-knowledge proofs on-chain using Stellar's new BN254 and Poseidon host functions."

**[0:20–1:15] A private, compliant payment.** Run `scripts/e2e.sh` and narrate section 1.
> "A business deposits into the pool — on-chain you see a commitment and an encrypted note, nothing about the amount or destination. A compliance provider — the ASP — approves this deposit's label and publishes an association-set root. Now the business withdraws to a brand-new address by generating a zero-knowledge proof: it proves the note is in the pool AND in the approved set AND hasn't been spent — without revealing which deposit is theirs. The proof is verified on-chain by the Soroban contract, and the funds land at a fresh, unlinkable address."

Point at the line: `recipient balance: ... -> ...  (private, ASP-compliant withdrawal OK)`.

**[1:15–2:00] Selective disclosure to an auditor.** Switch to the web page.
> "Later a regulator asks about that one payment. The business hands over a single disclosure key — for just that transaction. The auditor pastes it here, the page pulls the encrypted note from chain, decrypts exactly that note, and verifies the amount and recipient against the on-chain commitment. Everything else in the pool stays private."

Click **Reveal & verify** → show the green **AUDIT OK**.

**[2:00–2:25] Compliance is enforced by the math.** Back to the terminal (section 3).
> "And this isn't a policy you can bypass — a deposit that the ASP did *not* approve literally cannot produce a valid withdrawal proof. The circuit won't build a witness. Privacy from the public, transparency on demand, compliance enforced by zero-knowledge — on Stellar."

**[2:25–2:30] Close.**
> "Circom and Groth16 over BN254, verified on-chain with Stellar's Protocol 25/26 primitives. Repo and testnet contracts in the description."

---

## What to emphasize for judges
- The ZK is **load-bearing**: no valid proof ⇒ no withdrawal, and non-approved ⇒ no proof.
- On-chain verification uses the **native BN254 `pairing_check`** (Protocol 25/26).
- Three real capabilities: **unlinkable payments**, **ASP compliance**, **view-key selective disclosure** — all demoed live on testnet.
- Be upfront about the mocked parts (see README "What's real vs mocked").

## Submission checklist (DoraHacks)
- [ ] Public repo link (GitHub) with README.
- [ ] 2–3 min demo video (unlisted YouTube/Loom link).
- [ ] One line: "ZK = Groth16/BN254 proofs verified on-chain in a Soroban contract; withdrawal requires dual Merkle-membership + nullifier."
- [ ] Testnet contract IDs (see README / `deployments/`).
