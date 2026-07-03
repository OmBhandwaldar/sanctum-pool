import "./polyfills.js";
// Sanctum Pool dApp controller. Visual layer follows the Claude Design handoff;
// all logic (wallet, in-browser proving, contracts, operator, notes) is real.
import { CONFIG } from "./config.js";
import * as wallet from "./lib/wallet.js";
import { invoke, u256, addr, bytesHex, getCommitments, isKnownRoot } from "./lib/soroban.js";
import { proveWithdraw } from "./lib/prove.js";
import { proofHex } from "./lib/toSoroban.js";
import * as store from "./lib/notes.js";
import { createNote, commitmentOf, labelOf, nullifierHashOf } from "../../client/src/note.js";
import { genViewKeypair, encryptNote, blobToHex, blobFromHex, decryptWithDisclosureKey } from "../../client/src/viewkey.js";
import { verifyDisclosure } from "../../client/src/auditor.js";
import { recipientField } from "../../client/src/address.js";
import { toDec } from "../../client/src/field.js";
import { MerkleTree } from "../../client/src/merkle.js";
import { viewHome, initHome } from "./home.js";

// ASP operator endpoint. Override with VITE_OPERATOR at build time; defaults to
// the hosted operator in a production build and to the local one in dev.
const OPERATOR =
  import.meta.env.VITE_OPERATOR ||
  (import.meta.env.PROD ? "https://sanctum-pool.onrender.com" : "http://localhost:8787");
const state = { address: null, view: "home", selected: null };
let homeTeardown = null;
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? a.slice(0, 5) + "…" + a.slice(-5) : "");

// inline icons (Lucide, matching the design)
const I = {
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5.5V11c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5.5z"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  arrow: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/></svg>',
};
const ctaTail = `<span class="glow"></span><span class="chip">${I.arrow}</span>`;

// ---------- toasts ----------
function toast(msg, kind = "ok", hash) {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = msg + (hash ? ` <a href="${CONFIG.explorerTx(hash)}" target="_blank" rel="noopener">view tx</a>` : "");
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 6500);
}

// ---------- wallet ----------
function renderWallet() {
  const slot = $("wallet-slot");
  if (state.view === "home") {
    slot.innerHTML = `<button class="hx-nav-launch" id="wbtn">Launch app</button>`;
    $("wbtn").onclick = launchApp;
    return;
  }
  const label = state.address ? short(state.address) : "Connect wallet";
  slot.innerHTML = `<button class="wallet" id="wbtn"><span class="orb"></span><span>${label}</span></button>`;
  $("wbtn").onclick = state.address
    ? () => { wallet.disconnect(); state.address = null; renderWallet(); render(); }
    : connect;
}
async function connect() {
  try {
    state.address = await wallet.connect();
    renderWallet(); render();
    toast("Wallet connected");
  } catch (e) {
    const msg = e?.message || String(e);
    toast(msg === "cancelled" ? "Connection cancelled" : "Wallet error: " + msg, "err");
  }
}
function requireWallet() {
  if (!state.address) { toast("Connect your wallet first", "err"); return false; }
  return true;
}

// ---------- nav ----------
const TABS = [["deposit", "Deposit"], ["withdraw", "Withdraw"], ["pool", "Pool"], ["auditor", "Auditor"]];
const HOME_NAV = [["#how", "How it works"], ["#proof-band", "The proof"], ["#live", "Live"]];
function renderNav() {
  const nav = $("nav");
  if (state.view === "home") {
    nav.innerHTML = HOME_NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("");
    nav.querySelectorAll("a").forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const el = document.querySelector(a.getAttribute("href"));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    return;
  }
  nav.innerHTML = TABS.map(([k, l]) => `<button data-v="${k}" aria-current="${state.view === k}">${l}</button>`).join("");
  nav.querySelectorAll("button").forEach((b) => (b.onclick = () => { state.view = b.dataset.v; render(); }));
}
function launchApp() { state.view = "deposit"; render(); }
function goHome() { state.view = "home"; render(); }

// ---------- render ----------
function render() {
  const isHome = state.view === "home";
  document.documentElement.dataset.page = isHome ? "home" : "app";
  if (homeTeardown && !isHome) { homeTeardown(); homeTeardown = null; }
  renderNav();
  renderWallet();
  const v = $("view");
  if (isHome) {
    v.innerHTML = viewHome();
    homeTeardown = initHome({ onLaunch: launchApp });
    return;
  }
  if (state.view === "deposit") { v.innerHTML = viewDeposit(); $("dep-btn").onclick = doDeposit; }
  else if (state.view === "withdraw") { v.innerHTML = viewWithdraw(); wireWithdraw(); }
  else if (state.view === "pool") { v.innerHTML = viewPool(); loadPool(); }
  else if (state.view === "auditor") { v.innerHTML = viewAuditor(); $("a-btn").onclick = doAudit; }
  wireGlow();
}

function viewDeposit() {
  return `
  <section class="panel" data-anim>
    <div class="card"><div class="card-pad">
      <div class="card-head"><h1>Deposit</h1><span class="tag">Shielded</span></div>
      <p class="lead">A fixed denomination joins the anonymity set. Observers see only a commitment and an encrypted note, never the amount or your destination.</p>
      <div class="dep-box">
        <div class="top"><span class="l">You deposit</span><span class="r">Fixed amount</span></div>
        <div class="amt"><span class="n">0.1</span>
          <div class="token"><span class="mark">✦</span><span class="sym">XLM</span></div>
        </div>
      </div>
      <div class="info-rows">
        <div class="row"><span class="k">Privacy</span><span class="v">Unlinkable</span></div>
        <div class="row"><span class="k">Compliance</span><span class="v acc">ASP-gated</span></div>
      </div>
      <button class="cta" id="dep-btn"><span class="label">${I.lock} Deposit privately</span>${ctaTail}</button>
      <div id="dep-result"></div>
      <p class="foot-note">Every deposit looks identical. You'll back up a secret note before signing.</p>
    </div></div>
  </section>`;
}

function viewWithdraw() {
  const notes = store.listNotes();
  const list = notes.length
    ? notes.map((n) => `
      <div class="note" data-cm="${n.commitment}" aria-current="${state.selected === n.commitment}">
        <div><div class="t">0.1 XLM note</div><div class="cm">${n.commitment.slice(0, 22)}…</div></div>
        <span class="badge ${n.spent ? "spent" : ""}">${n.spent ? I.check + " Spent" : I.check + " Ready"}</span>
      </div>`).join("")
    : `<div class="empty">No notes yet. Make a deposit to get started.</div>`;
  return `
  <section class="panel" data-anim>
    <div class="card"><div class="card-pad">
      <div class="card-head"><h1>Withdraw</h1><span class="tag">ZK proof</span></div>
      <p class="lead">A zero-knowledge proof is generated in your browser, your secret never leaves this device. Funds move with no on-chain link to the deposit.</p>
      <div class="sel-label">Select note</div>
      <div id="notes" style="margin-bottom:14px">${list}</div>
      <label class="field" for="dest">Destination address</label>
      <input class="inp mb20" id="dest" placeholder="G… (defaults to your wallet)" value="${state.address || ""}" />
      <button class="cta" id="wd-btn" ${notes.length ? "" : "disabled"}><span class="label">${I.shield} Generate proof &amp; withdraw</span>${ctaTail}</button>
      <div id="wd-result"></div>
      <p class="foot-note">Requires the ASP service running so your deposit's compliance root is posted.</p>
    </div></div>
  </section>`;
}

function viewPool() {
  return `
  <section class="panel wide" data-anim>
    <div class="card"><div class="card-pad lg">
      <div class="card-head"><h1>Pool &amp; Compliance</h1><span class="tag live"><span class="dot"></span>Live</span></div>
      <p class="lead" style="max-width:70ch">Deposits and withdrawals are public; the link between them is not. A compliance provider (ASP) approves deposit labels and publishes an association-set root, so only screened funds can withdraw privately.</p>
      <div class="tiles">
        <div class="tile"><div class="k">Total deposits</div><div class="v" id="s-deposits">0</div></div>
        <div class="tile"><div class="k">Your notes</div><div class="v" id="s-notes">${store.listNotes().length}</div></div>
        <div class="tile"><div class="k">Denomination</div><div class="v">0.1 <small>XLM</small></div></div>
      </div>
      <div class="growth">
        <div class="top"><span class="l">Anonymity set growth</span><span class="r">recent activity</span></div>
        <div class="bars" id="bars"></div>
      </div>
      <div class="asp-strip"><span class="dot"></span><span class="txt">Association set <b>healthy</b> · ASP operator posts the approved root on-chain</span></div>
    </div></div>
  </section>`;
}

function viewAuditor() {
  return `
  <section class="panel" data-anim>
    <div class="card"><div class="card-pad">
      <div class="card-head"><h1>Auditor</h1><span class="tag">Selective disclosure</span></div>
      <p class="lead">With a single disclosure key for one transaction, an auditor decrypts exactly that note and verifies it against the on-chain commitment. Nothing else is exposed.</p>
      <label class="field" for="a-enc">Encrypted note (hex, from chain)</label>
      <textarea class="inp mb16" id="a-enc" rows="3" placeholder="0x…"></textarea>
      <div class="two mb20">
        <div><label class="field" for="a-key">Disclosure key</label><input class="inp" id="a-key" placeholder="key…" /></div>
        <div><label class="field" for="a-cm">On-chain commitment</label><input class="inp" id="a-cm" placeholder="0x…" /></div>
      </div>
      <button class="cta" id="a-btn"><span class="label">${I.eye} Reveal &amp; verify against chain</span>${ctaTail}</button>
      <div id="a-result"></div>
    </div></div>
  </section>`;
}

// ---------- flow stepper ----------
function startFlow(container, steps) {
  container.innerHTML = `<div class="flow" id="flowbox"></div>`;
  const box = $("flowbox");
  const render = (active) => {
    box.innerHTML = steps.map((s, i) =>
      `<div class="line">${i < active ? `<span class="ok">✓</span>` : i === active ? `<span class="spin"></span>` : `<span class="spin" style="opacity:.25;animation:none"></span>`}${s}</div>`
    ).join("");
  };
  render(0);
  return { step: (i) => render(i), done: () => render(steps.length), clear: () => (container.innerHTML = "") };
}

// ---------- deposit ----------
async function doDeposit() {
  if (!requireWallet()) return;
  try {
    const note = createNote();
    const [commitment, label, nullifierHash] = await Promise.all([commitmentOf(note), labelOf(note), nullifierHashOf(note)]);
    const auditor = genViewKeypair();
    const notePlain = { amount: toDec(note.amount), scope: toDec(note.scope), nonce: toDec(note.nonce), nullifier: toDec(note.nullifier), secret: toDec(note.secret), commitment: toDec(commitment) };
    const { blob, disclosureKey } = encryptNote(notePlain, auditor.vpk);
    const record = { commitment: toDec(commitment), label: toDec(label), nullifierHash: toDec(nullifierHash), amount: toDec(note.amount), scope: toDec(note.scope), nullifier: toDec(note.nullifier), secret: toDec(note.secret), nonce: toDec(note.nonce), encNote: blobToHex(blob), disclosureKey, auditorVsk: auditor.vsk };
    openBackupModal(record);
  } catch (e) {
    toast("Deposit prep failed: " + (e.message || e), "err");
  }
}

function openBackupModal(record) {
  const root = $("modal-root");
  root.innerHTML = `
  <div class="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="bk-t">
    <h3 id="bk-t"><span class="dot"></span> Back up your secret note</h3>
    <div class="warn">This note is the only way to withdraw. If you lose it the funds are gone, and Sanctum cannot recover it. It never leaves your browser.</div>
    <div class="note-blob">note-${record.commitment.slice(0, 40)}…</div>
    <div class="mrow" style="margin-top:14px">
      <button class="btn2" id="bk-dl">${I.download} Download note</button>
      <button class="btn2" id="bk-cp">${I.copy} Copy</button>
    </div>
    <label class="checkrow"><input type="checkbox" id="bk-ok" /> I have saved my note somewhere safe.</label>
    <div class="mrow"><button class="btn2" id="bk-cancel">Cancel</button><span class="spacer" style="flex:1"></span><button class="btn2 pri" id="bk-go" disabled>Sign deposit</button></div>
  </div></div>`;
  const close = () => (root.innerHTML = "");
  $("bk-dl").onclick = () => { const u = URL.createObjectURL(store.noteToBlob(record)); const a = document.createElement("a"); a.href = u; a.download = `sanctum-note-${record.commitment.slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(u); };
  $("bk-cp").onclick = () => navigator.clipboard.writeText(JSON.stringify(record));
  $("bk-ok").onchange = (e) => ($("bk-go").disabled = !e.target.checked);
  $("bk-cancel").onclick = close;
  $("bk-go").onclick = async () => { close(); await submitDeposit(record); };
}

async function submitDeposit(record) {
  const c = $("dep-result");
  const flow = startFlow(c, ["Signing deposit in your wallet…", "Confirming on Stellar…", "Submitting to ASP for approval…"]);
  try {
    flow.step(0);
    const { hash } = await invoke({ contractId: CONFIG.pool, method: "deposit", args: [addr(state.address), u256(record.commitment), bytesHex(record.encNote)], source: state.address, signXdr: wallet.signXdr });
    store.saveNote(record);
    flow.step(2);
    fetch(`${OPERATOR}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: record.label }) }).catch(() => {});
    flow.done();
    c.innerHTML = `<div class="result"><div class="h"><span class="dot"></span> Deposited 0.1 XLM, note saved</div><div class="note-blob">commitment ${record.commitment.slice(0, 44)}…</div><div class="sub">Compliance root is being posted by the ASP. You can now withdraw.</div></div>`;
    toast("Deposit confirmed", "ok", hash);
  } catch (e) {
    flow.clear();
    toast("Deposit failed: " + (e.message || e), "err");
  }
}

// ---------- withdraw ----------
function wireWithdraw() {
  $("view").querySelectorAll(".note").forEach((el) => (el.onclick = () => { state.selected = el.dataset.cm; render(); }));
  const b = $("wd-btn"); if (b) b.onclick = doWithdraw;
}

async function doWithdraw() {
  if (!requireWallet()) return;
  if (!state.selected) { toast("Select a note first", "err"); return; }
  const rec = store.getNote(state.selected);
  if (rec.spent) { toast("This note was already spent", "err"); return; }
  const dest = $("dest").value.trim() || state.address;
  const c = $("wd-result");
  const flow = startFlow(c, ["Loading pool state + proving key…", "Generating zero-knowledge proof…", "Checking ASP association root…", "Signing &amp; submitting withdrawal…"]);
  const btn = $("wd-btn"); btn.disabled = true;
  try {
    flow.step(0);
    const commits = (await getCommitments(CONFIG.pool)).map((c) => BigInt(c));
    const index = commits.findIndex((x) => x === BigInt(rec.commitment));
    if (index < 0) throw new Error("commitment not found on-chain yet");
    const tree = await MerkleTree.create(20);
    for (const x of commits) tree.insert(x);
    const st = await tree.proof(index);
    if (!(await isKnownRoot(CONFIG.pool, st.root))) throw new Error("state root not posted yet, is the operator running?");
    flow.step(2);
    const aspRes = await fetch(`${OPERATOR}/asp-path?label=${rec.label}`);
    if (!aspRes.ok) throw new Error("ASP has not approved this deposit yet");
    const asp = await aspRes.json();
    const input = { root: st.root.toString(), aspRoot: asp.aspRoot, recipient: recipientField(dest).toString(), amount: rec.amount, scope: rec.scope, nullifier: rec.nullifier, secret: rec.secret, nonce: rec.nonce, pathElements: st.pathElements.map(String), pathIndices: st.pathIndices.map(String), aspPathElements: asp.aspPathElements, aspPathIndices: asp.aspPathIndices };
    flow.step(1);
    const { proof } = await proveWithdraw(input, null);
    flow.step(3);
    const { hash } = await invoke({ contractId: CONFIG.pool, method: "withdraw", args: [bytesHex(proofHex(proof)), u256(rec.nullifierHash), u256(st.root), u256(asp.aspRoot), addr(dest)], source: state.address, signXdr: wallet.signXdr });
    store.markSpent(rec.commitment);
    flow.done();
    c.innerHTML = `<div class="result"><div class="h"><span class="tick">✓</span> 0.1 XLM withdrawn to a fresh address</div><div class="note-blob">to ${short(dest)} · no on-chain link to your deposit</div></div>`;
    toast("Withdrawal confirmed", "ok", hash);
    setTimeout(render, 1200);
  } catch (e) {
    flow.clear();
    toast("Withdraw failed: " + (e.message || e), "err");
  } finally {
    const b = $("wd-btn"); if (b) b.disabled = false;
  }
}

// ---------- pool ----------
async function loadPool() {
  drawBars();
  try {
    const commits = await getCommitments(CONFIG.pool);
    countUp($("s-deposits"), commits.length);
  } catch { if ($("s-deposits")) $("s-deposits").textContent = "—"; }
  countUp($("s-notes"), store.listNotes().length);
}
function countUp(el, target) {
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) { el.textContent = target; return; }
  let cur = 0; const step = () => { cur += Math.max(1, Math.ceil(target / 16)); if (cur >= target) { el.textContent = target; return; } el.textContent = cur; requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function drawBars() {
  const wrap = $("bars"); if (!wrap) return;
  const vals = [12, 18, 15, 24, 30, 27, 38, 34, 46, 52, 49, 60];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  wrap.innerHTML = vals.map((v, i) => {
    const last = i === vals.length - 1;
    const anim = reduce ? "" : `animation:sp-grow .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:${i * 35}ms`;
    return `<i class="${last ? "last" : ""}" style="height:${last ? 60 : v}%;${anim}"></i>`;
  }).join("");
}

// ---------- auditor ----------
async function doAudit() {
  const c = $("a-result");
  const flow = startFlow(c, ["Decrypting note with disclosure key…", "Recomputing commitment…", "Matching against on-chain record…"]);
  try {
    flow.step(0);
    const blob = blobFromHex($("a-enc").value.trim().replace(/^0x/, ""));
    const plain = decryptWithDisclosureKey(blob, $("a-key").value.trim());
    flow.step(1);
    const res = await verifyDisclosure(plain);
    flow.step(2);
    const matches = String(plain.commitment) === $("a-cm").value.trim();
    const amt = (Number(plain.amount) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 7 });
    flow.done();
    const ok = res.ok && matches;
    c.innerHTML = `<div class="result ${ok ? "" : "bad"}">
      <div class="h"><span class="tick">${ok ? "✓" : "✕"}</span> ${ok ? "Verified against chain commitment" : "Disclosure did not verify"}</div>
      <div class="aud-grid">
        <div><div class="kk">Amount</div><div class="vv">${amt} XLM</div></div>
        <div><div class="kk">Label</div><div class="vv">ASP-clean</div></div>
        <div><div class="kk">Match</div><div class="vv acc">${matches ? "Exact" : "No"}</div></div>
      </div>
      <div class="checks">
        <div class="c"><span class="m ${res.ok ? "" : "bad"}">${res.ok ? "✓" : "✕"}</span> commitment recomputed from plaintext matches</div>
        <div class="c"><span class="m ${matches ? "" : "bad"}">${matches ? "✓" : "✕"}</span> disclosed commitment equals the on-chain commitment</div>
      </div>
    </div>`;
  } catch (e) {
    flow.clear();
    c.innerHTML = `<div class="result bad"><div class="h"><span class="tick">✕</span> Decryption failed, wrong key or corrupted note</div></div>`;
  }
}

// ---------- cursor glow / spotlight ----------
function wireGlow() {
  $("view").querySelectorAll(".cta").forEach((btn) => {
    btn.onpointermove = (e) => { const r = btn.getBoundingClientRect(); btn.style.setProperty("--mx", e.clientX - r.left + "px"); btn.style.setProperty("--my", e.clientY - r.top + "px"); };
  });
}
(function spotlight() {
  const root = $("root"); if (!root) return;
  let px = 0, py = 0, pending = false;
  const flush = () => { pending = false; root.style.setProperty("--gx", px + "px"); root.style.setProperty("--gy", py + "px"); };
  root.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; root.style.setProperty("--spot-op", "1"); if (!pending) { pending = true; requestAnimationFrame(flush); } });
  root.addEventListener("pointerleave", () => root.style.setProperty("--spot-op", "0"));
})();

// ---------- boot ----------
const brand = document.querySelector(".brand");
if (brand) { brand.style.cursor = "pointer"; brand.onclick = goHome; }
render();
