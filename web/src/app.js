import "./polyfills.js";
// Sanctum Pool dApp controller (vanilla JS).
import { CONFIG } from "./config.js";
import { icons } from "./icons.js";
import * as wallet from "./lib/wallet.js";
import { invoke, u256, addr, bytesHex, getCommitments, isKnownRoot, getEncNote } from "./lib/soroban.js";
import { proveWithdraw } from "./lib/prove.js";
import { proofHex } from "./lib/toSoroban.js";
import * as store from "./lib/notes.js";
import { createNote, commitmentOf, labelOf, nullifierHashOf } from "../../client/src/note.js";
import { genViewKeypair, encryptNote, blobToHex, blobFromHex, decryptWithDisclosureKey } from "../../client/src/viewkey.js";
import { verifyDisclosure } from "../../client/src/auditor.js";
import { recipientField } from "../../client/src/address.js";
import { toDec } from "../../client/src/field.js";
import { MerkleTree } from "../../client/src/merkle.js";

const OPERATOR = "http://localhost:8787";
const state = { address: null, view: "deposit", selected: null };
const $ = (id) => document.getElementById(id);
const short = (a) => (a ? a.slice(0, 5) + "…" + a.slice(-5) : "");

// ---------- toasts ----------
function toast(msg, kind = "ok", hash) {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = msg + (hash ? ` <a href="${CONFIG.explorerTx(hash)}" target="_blank" rel="noopener">view tx</a>` : "");
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

// ---------- wallet ----------
function renderWallet() {
  const slot = $("wallet-slot");
  if (state.address) {
    slot.innerHTML = `<button class="btn btn-ghost" id="wbtn">${icons.wallet}<span class="mono">${short(state.address)}</span></button>`;
    $("wbtn").onclick = () => { wallet.disconnect(); state.address = null; renderWallet(); render(); };
  } else {
    slot.innerHTML = `<button class="btn btn-primary" id="wbtn">${icons.wallet} Connect wallet</button>`;
    $("wbtn").onclick = connect;
  }
}
async function connect() {
  try {
    state.address = await wallet.connect();
    renderWallet();
    render();
    toast("Wallet connected");
  } catch (e) {
    toast("Connection cancelled", "err");
  }
}
function requireWallet() {
  if (!state.address) { toast("Connect your wallet first", "err"); return false; }
  return true;
}

// ---------- nav ----------
const TABS = [
  ["deposit", "Deposit"],
  ["withdraw", "Withdraw"],
  ["status", "Pool & Compliance"],
  ["auditor", "Auditor"],
];
function renderNav() {
  $("nav").innerHTML = TABS.map(
    ([k, label]) => `<button data-v="${k}" aria-current="${state.view === k}">${label}</button>`
  ).join("");
  $("nav").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.view = b.dataset.v; render(); }));
}

// ---------- views ----------
function render() {
  renderNav();
  const v = $("view");
  if (state.view === "deposit") v.innerHTML = viewDeposit();
  else if (state.view === "withdraw") { v.innerHTML = viewWithdraw(); wireWithdraw(); }
  else if (state.view === "status") { v.innerHTML = viewStatus(); loadStatus(); }
  else if (state.view === "auditor") { v.innerHTML = viewAuditor(); wireAuditor(); }
  if (state.view === "deposit") $("dep-btn").onclick = doDeposit;
}

function viewDeposit() {
  return `
  <section class="card">
    <div class="eyebrow">Shielded deposit</div>
    <h2 class="mt">Deposit privately into the pool</h2>
    <p class="lead">A fixed denomination joins the anonymity set. On-chain, observers see only a commitment and an encrypted note - never the amount or your future destination. You will later withdraw to a fresh, unlinkable address.</p>
    <div class="grid-tiles">
      <div class="tile"><div class="k">Denomination</div><div class="v">${CONFIG.denomLabel}</div></div>
      <div class="tile"><div class="k">Privacy</div><div class="v" style="font-size:15px">Unlinkable</div></div>
      <div class="tile"><div class="k">Compliance</div><div class="v" style="font-size:15px">ASP-gated</div></div>
    </div>
    <button class="btn btn-primary btn-block mt" id="dep-btn">${icons.lock} Deposit ${CONFIG.denomLabel} privately</button>
    <p class="help">Amount is fixed so every deposit looks identical. You will be asked to back up your secret note before signing.</p>
  </section>`;
}

function viewWithdraw() {
  const notes = store.listNotes();
  const items = notes.length
    ? notes.map((n) => `
      <div class="note-item" data-cm="${n.commitment}" aria-current="${state.selected === n.commitment}">
        <div><div>${CONFIG.denomLabel} note</div><div class="cm">${n.commitment.slice(0, 22)}…</div></div>
        ${n.spent ? `<span class="badge spent">${icons.check} Spent</span>` : `<span class="badge off">Ready</span>`}
      </div>`).join("")
    : `<div class="empty">No notes yet. Make a deposit to get started.</div>`;
  return `
  <section class="card">
    <div class="eyebrow">Private withdrawal</div>
    <h2 class="mt">Withdraw to a fresh address</h2>
    <p class="lead">Select a note. A zero-knowledge proof is generated in your browser (your secret never leaves this device) proving the note is in the pool and in the ASP-approved set, then funds move with no on-chain link to the deposit.</p>
    <div id="notes">${items}</div>
    <label class="field" for="dest">Destination address</label>
    <input class="inp" id="dest" placeholder="G… (defaults to your wallet)" value="${state.address || ""}" />
    <div id="prove-area"></div>
    <button class="btn btn-primary btn-block mt" id="wd-btn" ${notes.length ? "" : "disabled"}>${icons.shield} Generate proof & withdraw</button>
    <p class="help">Requires the operator/ASP service running so your deposit's compliance root is posted.</p>
  </section>`;
}

function viewStatus() {
  return `
  <section class="card">
    <div class="eyebrow">Pool &amp; compliance</div>
    <h2 class="mt">Live pool state</h2>
    <p class="lead">Deposits and withdrawals are public; the link between them is not. A compliance provider (ASP) approves deposit labels and publishes an association-set root, so only screened funds can withdraw privately.</p>
    <div class="grid-tiles" id="stat-tiles">
      <div class="tile"><div class="k">Total deposits</div><div class="v" id="s-deposits">…</div></div>
      <div class="tile"><div class="k">Your notes</div><div class="v" id="s-notes">${store.listNotes().length}</div></div>
      <div class="tile"><div class="k">Denomination</div><div class="v">${CONFIG.denomLabel}</div></div>
    </div>
  </section>`;
}

function viewAuditor() {
  return `
  <section class="card">
    <div class="eyebrow">Selective disclosure</div>
    <h2 class="mt">Auditor reveal</h2>
    <p class="lead">A private payment leaks nothing on-chain. With a single disclosure key for one transaction, an auditor decrypts exactly that note and verifies it against the on-chain commitment - nothing else is exposed.</p>
    <label class="field" for="a-enc">Encrypted note (hex, from chain)</label>
    <textarea class="inp" id="a-enc"></textarea>
    <div class="row">
      <div style="flex:1"><label class="field" for="a-key">Disclosure key</label><input class="inp" id="a-key" /></div>
      <div style="flex:1"><label class="field" for="a-cm">On-chain commitment</label><input class="inp" id="a-cm" /></div>
    </div>
    <button class="btn btn-primary btn-block mt" id="a-btn">${icons.eye} Reveal &amp; verify against chain</button>
    <div id="a-out"></div>
  </section>`;
}

// ---------- deposit flow ----------
async function doDeposit() {
  if (!requireWallet()) return;
  const btn = $("dep-btn"); btn.disabled = true; btn.textContent = "Preparing note…";
  try {
    const note = createNote();
    const [commitment, label, nullifierHash] = await Promise.all([
      commitmentOf(note), labelOf(note), nullifierHashOf(note),
    ]);
    const auditor = genViewKeypair();
    const notePlain = {
      amount: toDec(note.amount), scope: toDec(note.scope), nonce: toDec(note.nonce),
      nullifier: toDec(note.nullifier), secret: toDec(note.secret), commitment: toDec(commitment),
    };
    const { blob, disclosureKey } = encryptNote(notePlain, auditor.vpk);
    const record = {
      commitment: toDec(commitment), label: toDec(label), nullifierHash: toDec(nullifierHash),
      amount: toDec(note.amount), scope: toDec(note.scope), nullifier: toDec(note.nullifier),
      secret: toDec(note.secret), nonce: toDec(note.nonce),
      encNote: blobToHex(blob), disclosureKey, auditorVsk: auditor.vsk,
    };
    openBackupModal(record);
  } catch (e) {
    toast("Deposit prep failed: " + (e.message || e), "err");
  } finally {
    btn.disabled = false; btn.innerHTML = `${icons.lock} Deposit ${CONFIG.denomLabel} privately`;
  }
}

function openBackupModal(record) {
  const root = $("modal-root");
  root.innerHTML = `
  <div class="scrim">
    <div class="modal danger" role="dialog" aria-modal="true" aria-labelledby="bk-t">
      <h3 id="bk-t">Back up your secret note</h3>
      <div class="warnbox">${icons.alert} This note is the only way to withdraw. If you lose it, the funds are gone. Sanctum cannot recover it.</div>
      <div class="row">
        <button class="btn btn-ghost" id="bk-dl">${icons.download} Download note</button>
        <button class="btn btn-ghost" id="bk-cp">${icons.copy} Copy</button>
      </div>
      <label class="check-row"><input type="checkbox" id="bk-ok" /> I have saved my note somewhere safe.</label>
      <div class="row">
        <button class="btn btn-ghost" id="bk-cancel">Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="bk-confirm" disabled>${icons.arrow} Sign deposit</button>
      </div>
    </div>
  </div>`;
  const close = () => (root.innerHTML = "");
  $("bk-dl").onclick = () => {
    const url = URL.createObjectURL(store.noteToBlob(record));
    const a = document.createElement("a");
    a.href = url; a.download = `sanctum-note-${record.commitment.slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  $("bk-cp").onclick = () => navigator.clipboard.writeText(JSON.stringify(record));
  $("bk-ok").onchange = (e) => ($("bk-confirm").disabled = !e.target.checked);
  $("bk-cancel").onclick = close;
  $("bk-confirm").onclick = async () => {
    close();
    await submitDeposit(record);
  };
}

async function submitDeposit(record) {
  toast("Confirm the deposit in your wallet…");
  try {
    const { hash } = await invoke({
      contractId: CONFIG.pool, method: "deposit",
      args: [addr(state.address), u256(record.commitment), bytesHex(record.encNote)],
      source: state.address, signXdr: wallet.signXdr,
    });
    store.saveNote(record);
    toast("Deposit confirmed", "ok", hash);
    // ask the operator/ASP to approve the label + post roots
    fetch(`${OPERATOR}/approve`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: record.label }),
    }).then(() => toast("Submitted to ASP for approval")).catch(() => {});
    state.view = "withdraw"; render();
  } catch (e) {
    toast("Deposit failed: " + (e.message || e), "err");
  }
}

// ---------- withdraw flow ----------
function wireWithdraw() {
  $("view").querySelectorAll(".note-item").forEach((el) => {
    el.onclick = () => { state.selected = el.dataset.cm; render(); };
  });
  const btn = $("wd-btn");
  if (btn) btn.onclick = doWithdraw;
}

function showSteps(active) {
  const steps = [["witness", "Building witness"], ["proving", "Generating ZK proof (in your browser)"], ["submit", "Submitting to Stellar"]];
  const idx = steps.findIndex(([k]) => k === active);
  $("prove-area").innerHTML = `<div class="stepper">${steps
    .map(([k, label], i) => `<div class="step ${i < idx ? "done" : i === idx ? "active" : ""}"><span class="ring"></span>${label}</div>`)
    .join("")}</div>`;
}

async function doWithdraw() {
  if (!requireWallet()) return;
  if (!state.selected) { toast("Select a note first", "err"); return; }
  const rec = store.getNote(state.selected);
  if (rec.spent) { toast("This note was already spent", "err"); return; }
  const dest = $("dest").value.trim() || state.address;
  const btn = $("wd-btn"); btn.disabled = true;
  try {
    showSteps("witness");
    // rebuild state tree from on-chain commitments
    const commits = (await getCommitments(CONFIG.pool)).map((c) => BigInt(c));
    const index = commits.findIndex((c) => c === BigInt(rec.commitment));
    if (index < 0) throw new Error("commitment not found on-chain yet");
    const tree = await MerkleTree.create(20);
    for (const c of commits) tree.insert(c);
    const st = await tree.proof(index);
    if (!(await isKnownRoot(CONFIG.pool, st.root)))
      throw new Error("state root not posted yet - is the operator running?");
    // ASP path from the operator
    const aspRes = await fetch(`${OPERATOR}/asp-path?label=${rec.label}`);
    if (!aspRes.ok) throw new Error("ASP has not approved this deposit yet");
    const asp = await aspRes.json();

    const input = {
      root: st.root.toString(), aspRoot: asp.aspRoot,
      recipient: recipientField(dest).toString(), amount: rec.amount, scope: rec.scope,
      nullifier: rec.nullifier, secret: rec.secret, nonce: rec.nonce,
      pathElements: st.pathElements.map(String), pathIndices: st.pathIndices.map(String),
      aspPathElements: asp.aspPathElements, aspPathIndices: asp.aspPathIndices,
    };
    showSteps("proving");
    const { proof } = await proveWithdraw(input, null);
    showSteps("submit");
    toast("Confirm the withdrawal in your wallet…");
    const { hash } = await invoke({
      contractId: CONFIG.pool, method: "withdraw",
      args: [bytesHex(proofHex(proof)), u256(rec.nullifierHash), u256(st.root), u256(asp.aspRoot), addr(dest)],
      source: state.address, signXdr: wallet.signXdr,
    });
    store.markSpent(rec.commitment);
    $("prove-area").innerHTML = "";
    toast(`Withdrew ${CONFIG.denomLabel} to ${short(dest)}`, "ok", hash);
    render();
  } catch (e) {
    $("prove-area").innerHTML = "";
    toast("Withdraw failed: " + (e.message || e), "err");
  } finally {
    const b = $("wd-btn"); if (b) b.disabled = false;
  }
}

// ---------- status ----------
async function loadStatus() {
  try {
    const commits = await getCommitments(CONFIG.pool);
    if ($("s-deposits")) $("s-deposits").textContent = commits.length;
  } catch {
    if ($("s-deposits")) $("s-deposits").textContent = "-";
  }
}

// ---------- auditor ----------
function wireAuditor() {
  $("a-btn").onclick = async () => {
    const out = $("a-out");
    try {
      const blob = blobFromHex($("a-enc").value.trim().replace(/^0x/, ""));
      const plain = decryptWithDisclosureKey(blob, $("a-key").value.trim());
      const onchain = $("a-cm").value.trim();
      const res = await verifyDisclosure(plain);
      const matches = String(plain.commitment) === onchain;
      out.innerHTML = `
        <div class="result">
          <div class="kv"><span class="muted">amount</span><span class="val">${plain.amount}</span></div>
          <div class="kv"><span class="muted">recipient</span><span class="val">${plain.recipient}</span></div>
          <div class="kv"><span class="muted">commitment</span><span class="val trunc" style="max-width:280px">${plain.commitment}</span></div>
          <div class="check"><span class="ic ${res.ok ? "ok-fg" : "bad-fg"}">${res.ok ? icons.check : icons.x}</span> commitment recomputed from plaintext matches</div>
          <div class="check"><span class="ic ${matches ? "ok-fg" : "bad-fg"}">${matches ? icons.check : icons.x}</span> disclosed commitment equals the on-chain commitment</div>
          <div class="verdict ${res.ok && matches ? "ok" : "bad"}">${res.ok && matches ? `AUDIT OK - deposit of ${plain.amount} to ${plain.recipient}` : "Disclosure did not verify"}</div>
        </div>`;
    } catch (e) {
      out.innerHTML = `<div class="verdict bad">Decryption failed - wrong key or corrupted note</div>`;
    }
  };
}

// ---------- boot ----------
renderWallet();
render();
