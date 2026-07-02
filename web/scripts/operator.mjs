// Sanctum operator / ASP service (off-chain, admin-side).
//
// Keeps the admin key OFF the browser. Two jobs:
//   1. POST /approve {label}  → post the current state root (from on-chain
//      commitments) + approve the label + post the ASP root.
//   2. GET  /asp-path?label=  → return the ASP Merkle path for a label so the
//      browser can build its withdrawal witness.
//
// DEMO: auto-approves every label (screening is mocked). Run:
//   SANCTUM_SECRET=$(stellar keys show sanctum) node web/scripts/operator.mjs
import { createServer } from "http";
import { execSync } from "child_process";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { NETWORK, invoke, u256, readView } from "../src/lib/soroban.js";
import { MerkleTree } from "../../client/src/merkle.js";
import { CONFIG } from "../src/config.js";

const PORT = 8787;
const secret = process.env.SANCTUM_SECRET || execSync("stellar keys show sanctum").toString().trim();
const admin = Keypair.fromSecret(secret);
const signXdr = async (xdr) => {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK);
  tx.sign(admin);
  return tx.toXDR();
};
const invokeAdmin = (method, args) =>
  invoke({ contractId: CONFIG.pool, method, args, source: admin.publicKey(), signXdr });

const approved = new Set();

async function stateTree() {
  const commits = await readView(CONFIG.pool, "commitments");
  const t = await MerkleTree.create(20);
  for (const c of commits) t.insert(BigInt(c));
  return t;
}
async function aspTree() {
  const t = await MerkleTree.create(20);
  for (const l of approved) t.insert(BigInt(l));
  return t;
}

async function postStateRoot() {
  const root = await (await stateTree()).root();
  await invokeAdmin("update_root", [u256(root)]);
  return root;
}
async function approveLabel(label) {
  approved.add(String(label));
  const root = await (await aspTree()).root();
  await invokeAdmin("update_asp_root", [u256(root)]);
  return root;
}

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return res.end();
  }
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "POST" && url.pathname === "/approve") {
      let body = "";
      for await (const c of req) body += c;
      const { label } = JSON.parse(body || "{}");
      console.log("[approve]", label);
      const stateRoot = await postStateRoot();
      const aspRoot = await approveLabel(label);
      return json(res, 200, { ok: true, stateRoot: stateRoot.toString(), aspRoot: aspRoot.toString() });
    }
    if (req.method === "GET" && url.pathname === "/asp-path") {
      const label = url.searchParams.get("label");
      if (!approved.has(String(label))) return json(res, 404, { error: "label not approved" });
      const t = await aspTree();
      const idx = [...approved].indexOf(String(label));
      const p = await t.proof(idx);
      return json(res, 200, {
        aspRoot: p.root.toString(),
        aspPathElements: p.pathElements.map(String),
        aspPathIndices: p.pathIndices.map(String),
      });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`Sanctum operator on http://localhost:${PORT} (admin ${admin.publicKey().slice(0, 6)}…)`));
