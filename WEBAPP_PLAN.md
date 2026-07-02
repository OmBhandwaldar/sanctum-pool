# WEBAPP_PLAN.md — Sanctum Pool full dApp (M7)

> Branch: `feature/web-dapp`. Goal: a browser dApp for the compliant privacy pool — connect wallet, deposit, withdraw with **in-browser ZK proving** (secrets never leave the device), see pool/ASP status, and the existing auditor reveal. `main` stays the safe, submitted state; this only merges if it lands clean.

Planning only — no app code until this is approved. Design intelligence sourced from the `ui-ux-pro-max` skill; final visual polish will apply the installed `taste-skill` (high-end-visual-design / design-taste-frontend) during implementation.

---

## 1. Scope — reuse vs new (~60% reuse)

**Reuse as-is (already browser-compatible):**
- `client/src/` crypto: `note.js`, `merkle.js`, `poseidon.js` (circomlibjs), `viewkey.js`, `auditor.js`, `address.js`, `field.js` (Web Crypto), witness-input building.
- Circuit artifacts: `withdraw.wasm` + `withdraw_final.zkey` (served as static assets).
- `web/` Vite scaffold + the auditor reveal page + its styling.

**New work:**
1. **In-browser proving** — `snarkjs.groth16.fullProve(input, wasm, zkey)` client-side, with a progress UX.
2. **Wallet integration** — Freighter via Stellar Wallets Kit; sign/submit Soroban txs.
3. **Contract tx layer** — `@stellar/stellar-sdk` to build/simulate/submit `deposit` / `withdraw` and read views (`commitments`, `is_known_root`, `get_enc_note`, `recipient_field`).
4. **JS proof→bytes port** — reimplement `tools/circom2soroban` encoding in JS (big-endian; G2 `be(c1)||be(c0)`) so proofs post from the browser.
5. **In-browser state rebuild** — read `commitments()` from the pool, rebuild the Merkle tree (`merkle.js`), fetch ASP path from the curator.
6. **UI shell + flows** — nav, deposit, withdraw, status; note persistence (localStorage/OPFS).
7. **Root posting** — admin-only `update_root`/`update_asp_root` stays with an **operator** (the ASP curator run as a small watcher/service), not the end user.

---

## 2. Architecture

```
Browser (Vite, vanilla JS)
├─ ui/            shell, deposit, withdraw, status, auditor (views)
├─ lib/
│  ├─ wallet.js       Stellar Wallets Kit (Freighter connect/sign)
│  ├─ soroban.js      stellar-sdk: build/simulate/submit + view calls
│  ├─ prove.js        snarkjs fullProve(wasm, zkey) + progress events
│  ├─ toSoroban.js    JS port of circom2soroban (proof/vk/public → bytes)
│  ├─ notes.js        local note store (save/restore/import/export)
│  └─ (reuse) ../client/src/{note,merkle,poseidon,viewkey,auditor,address,field}
└─ public/circuits/   withdraw.wasm, withdraw_final.zkey (static)

Operator (off-chain, existing) : asp-service/curator + a watcher that posts
                                  state root + ASP root after deposits/approvals.
On-chain (existing, unchanged) : verifier + pool contracts on testnet.
```

Trust model unchanged from the CLI: user does deposit/withdraw; the operator (ASP/sequencer) posts roots. No contract changes needed.

---

## 3. Design system (from ui-ux-pro-max, adapted for web)

**Style:** refined dark glassmorphism ("Linear/Vercel" premium), Trust & Authority layout, high-contrast, WCAG-minded. Avoid: neon/cyberpunk, playful, unclear fees, pure `#000`.

**Tokens** (CSS variables — consistent with the existing auditor page):
```
--bg-deep:#070a14  --bg-base:#0b1020  --bg-elev:#12182c
--surface:rgba(255,255,255,.05)  --border:rgba(120,150,220,.18)
--fg:#e8ecf5  --fg-muted:#9fb0d0
--accent:#7c8bff  --accent-2:#9a8bff  --accent-glow:rgba(124,139,255,.22)
--success:#5ee6a8  --danger:#ff7b8a  --warning:#f5c66b
--radius:16px  --ease:cubic-bezier(.16,1,.3,1)
```
- **Fonts:** Inter (UI, 400/500/600), JetBrains Mono (hashes, keys, amounts — tabular figures). `font-display:swap`.
- **Effects:** glass cards (`backdrop-filter:blur(8px)`), hairline borders, one soft accent glow behind the primary CTA, 1–2 slow ambient gradient blobs (respect `prefers-reduced-motion`), 150–300ms transitions, press scale 0.97.
- **Icons:** Lucide (SVG), consistent stroke; no emoji.

---

## 4. dApp shell + layouts

**Shell:** sticky top bar — left: Sanctum wordmark + `Testnet` badge; right: **Connect wallet** button (→ truncated address + balance when connected). Below: segmented nav **Deposit · Withdraw · Pool & Compliance · Auditor**. Single centered column, `max-width:1080px`, responsive at 375/768/1024/1440. One primary CTA per view.

**Deposit view:** glass card — fixed denomination shown clearly (no hidden fees), "Deposit 0.1 XLM privately" CTA. On submit → generate note → **Note-backup modal** (blocking) → sign deposit tx → success toast + link to explorer.

**Withdraw view:** card — pick/restore a saved note (list of local notes with status: *approved / awaiting ASP / spent*), destination address input, "Generate proof & withdraw" CTA → **proving progress** → sign/submit → success (funds to fresh address).

**Pool & Compliance view:** stat tiles (total deposits, current state root, current ASP root, your note's approval status); short "how compliance works" explainer. Read-only.

**Auditor view:** the existing reveal page, restyled to shared tokens.

---

## 5. Component specs

- **Wallet connect button** — states: idle / connecting (spinner, disabled) / connected (address + balance, dropdown: copy, disconnect) / wrong-network (amber "Switch to Testnet"). `aria-live` on state change.
- **Deposit card** — denomination in JetBrains Mono, primary CTA with accent glow, disabled+spinner while signing, helper text "Amount is fixed for the anonymity set."
- **Note-backup modal (critical)** — danger-tinted; shows the note secret (mono, copyable) + **Download .json**; explicit warning "If you lose this note, you lose your funds — Sanctum cannot recover it."; a required **checkbox "I have saved my note"** gates the confirm button; no dismiss-on-backdrop.
- **Withdraw card + proving progress** — determinate stepper: **1 Building witness → 2 Generating ZK proof (runs in your browser) → 3 Submitting**; shimmer/progress, non-blocking, `role="status"` `aria-live="polite"`; est. "~5–15s". Cancelable before submit.
- **ASP status badge** — success (Approved), amber (Awaiting approval), muted (Not in set); icon+text (not color alone).
- **Toasts** — `role="alert"` for errors, `aria-live=polite` for success; auto-dismiss 3–5s; never steal focus.

---

## 6. UX for the risky moments (from ux domain)

- **Wallet signing** — before: "Confirm in your wallet…"; disable CTA + spinner; handle user-rejection with a clear retry, not a dead end; show explorer link on success.
- **Multi-second proving** — always a determinate stepper + reassurance it's local ("your secret never leaves this device"); keep UI interactive; if a Web Worker is feasible, prove off the main thread to avoid jank (fallback: main thread with staged status updates).
- **Save-your-secret** — treat as a destructive/irreversible gate: blocking modal, explicit consequence text, required confirm checkbox, copy + download. Optional auto-save draft to localStorage.
- **Errors** — near the field, `role=alert`, cause + recovery ("Insufficient balance — fund your testnet account"). Focus first invalid field.
- **Empty states** — Withdraw with no saved notes → "No notes yet. Make a deposit to get started."

---

## 7. Key technical decisions & unknowns

- **snarkjs in-browser** — import `snarkjs` (already a dep); `fullProve` needs `withdraw.wasm` + `withdraw_final.zkey` served from `public/`. zkey ≈ 10 MB → load once, cache; show a one-time "preparing prover" state. Vite must not choke on snarkjs (may need `optimizeDeps`/`define global` shims — validated in the de-risk spike).
- **Proof→bytes in JS** — mirror `tools/circom2soroban/src/main.rs`: 32-byte BE field, G1 `x||y`, G2 `be(x_c1)||be(x_c0)||be(y_c1)||be(y_c0)`, public = `u32 len || 32-byte BE each`. Cross-check one proof against the Rust tool byte-for-byte before trusting it.
- **stellar-sdk + Wallets Kit** — build `withdraw`/`deposit` invoke ops, `simulate` for footprint, sign via wallet, submit, poll result. `recipient_field` binding: derive in JS (already in `address.js`) and confirm it equals the pool's `recipient_field(recipient)` view.
- **Root posting** — keep operator-side. For the demo, run `asp-service` as a small watcher that auto-approves + posts state/ASP roots after a deposit (documented). The dApp UI does not expose admin actions.
- **Denomination/asset** — native XLM SAC, fixed denom (as CLI). Deposit needs the user's `require_auth` — handled by wallet signing.

---

## 8. Milestones (de-risk first; each independently demoable)

- **W0 — Setup (~30m):** add `@stellar/stellar-sdk`, `@creit.tech/stellar-wallets-kit`, ensure `snarkjs` in `web`; scaffold shell + design tokens; copy `withdraw.wasm`/`.zkey` to `public/circuits/`.
- **W1 — DE-RISK: in-browser proving (~1–2h):** `prove.js` runs `fullProve` on a fixed input from `genWithdrawInput`, verify locally with the vk. *Exit: a browser-generated proof verifies.* (Highest risk — do first.)
- **W2 — Proof→bytes JS + on-chain verify (~1h):** `toSoroban.js`; post a browser proof to the deployed verifier → `true`. *Exit: byte-parity with the Rust tool, on-chain verify passes.*
- **W3 — Wallet + reads (~1–2h):** connect Freighter; read `commitments()`, roots, balances. *Exit: connected wallet + live pool state in UI.*
- **W4 — Withdraw flow (~2h):** rebuild tree from chain, get ASP path from curator, prove, sign, submit; funds land at destination. *Exit: end-to-end withdraw from the browser.*
- **W5 — Deposit flow + note backup (~2h):** note gen, encrypt, backup modal, sign+submit deposit; operator watcher posts roots. *Exit: deposit→(approve)→withdraw fully in-browser.*
- **W6 — Status view + polish (~2h):** stats, ASP badges, restyle auditor to tokens, responsive, reduced-motion, a11y pass; apply `taste-skill` visual polish. *Exit: cohesive, premium UI.*
- **W7 — Demo + docs:** update README/DEMO with the dApp path; optional re-record video.

---

## 9. Risks & fallbacks

- **In-browser proving fails/slow** (top risk) → mitigated by W1 first. Fallback: Web Worker; if truly blocked, keep proving via a tiny local helper and only the UX in browser (documented) — but goal is full client-side.
- **snarkjs/Vite bundling issues** → shim globals in `vite.config`; worst case load snarkjs from CDN.
- **Wallet signing quirks / network mismatch** → explicit Testnet guard + retry.
- **zkey 10 MB load** → cache + "preparing prover" state; acceptable for a demo.
- **Time** → milestones ordered so W1–W4 (the proof that browser proving + on-chain verify works) is the win; deposit/polish are additive. If time runs out, `main` (CLI + auditor page) is already the complete submission.

## 10. Verification
- W1/W2: browser proof verifies locally and on-chain (byte-parity vs Rust tool).
- W4/W5: full deposit→withdraw from the browser on testnet; funds move; double-spend still rejected; front-run still rejected.
- Pre-merge: a11y (contrast, focus, reduced-motion, keyboard), responsive 375–1440, then merge `feature/web-dapp` → `main`.
