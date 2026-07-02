# Sanctum Pool — Web dApp

A browser dApp for the compliant privacy pool: connect a Stellar wallet, deposit privately, and **withdraw with the zero-knowledge proof generated entirely in your browser** (your secret never leaves the device). Plus the pool/compliance status view and the auditor selective-disclosure reveal.

Dark-glassmorphism UI (Vite + vanilla JS), reusing the same `client/` crypto modules as the CLI.

## Run

```bash
# from repo root: contracts built + circuit keys present (see main README)
cd web
npm install
npm run dev            # opens the dApp; circuit wasm/zkey are auto-copied into public/
```

For deposits/withdrawals you also need a wallet and the operator/ASP service:

```bash
# 1. A Stellar wallet browser extension (Freighter) set to Testnet, funded via Friendbot.

# 2. The operator/ASP service (admin-side: posts state + ASP roots, serves ASP paths).
#    Keeps the admin key off the browser. From repo root:
SANCTUM_SECRET=$(stellar keys show sanctum) node web/scripts/operator.mjs
```

Then in the dApp: **Deposit** (back up the note, sign) → the operator approves + posts roots → **Withdraw** (proof is generated in-browser, then you sign) → funds land at a fresh address. **Auditor** verifies a disclosed note against chain.

## What's validated vs. needs a wallet

- **Validated (headless / on-chain):** production build; the UI renders; a **live testnet RPC read runs in-browser**; in-browser `snarkjs` proving works (~1s) and a browser-generated proof is **byte-identical to the Rust encoder and verifies on-chain**.
- **Needs a browser wallet to click-test end-to-end:** the deposit/withdraw **signing** flows (Freighter) and the deposit→approve→withdraw round-trip with the operator running. The code paths reuse the exact contracts/proofs the CLI `scripts/e2e.sh` already verifies on testnet.

## Architecture

- `src/lib/prove.js` — in-browser Groth16 proving (snarkjs).
- `src/lib/toSoroban.js` — proof/vk/public → BN254 byte layout (JS port of `tools/circom2soroban`, byte-parity verified).
- `src/lib/soroban.js` — reads via simulation; writes via prepare + wallet-sign + submit.
- `src/lib/wallet.js` — Freighter via Stellar Wallets Kit.
- `src/lib/notes.js` — local note store (the note is the only way to withdraw).
- `src/app.js` — shell + Deposit / Withdraw / Pool & Compliance / Auditor views.
- `scripts/operator.mjs` — off-chain ASP/operator (admin root posting + ASP paths).

## Config

Contract IDs + pool params live in `src/config.js`. Update after redeploying (see `deployments/`).
