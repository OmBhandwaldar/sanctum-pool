// Sanctum ASP (Association Set Provider) curator — the compliance authority.
//
// Maintains an allow-list of approved deposit LABELS and exposes the
// association-set Merkle root (which the admin posts on-chain via
// update_asp_root) plus membership proofs the withdrawer needs.
//
// DEMO SCOPE: approval is a manual admin toggle here (`approve <label>`), not a
// real sanctions/AML screen. A label = Poseidon(scope, nonce) is a per-deposit
// id that reveals nothing about the note's amount or owner, so screening by
// label leaks no private data. Screening intelligence is intentionally mocked.
//
// Usage:
//   node asp-service/curator.js approve <labelDecimal>
//   node asp-service/curator.js root
//   node asp-service/curator.js proof <labelDecimal>
//   node asp-service/curator.js list
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { MerkleTree } from "../client/src/merkle.js";
import { toDec } from "../client/src/field.js";

const LEVELS = 20;
const here = dirname(fileURLToPath(import.meta.url));
const STORE = resolve(here, "approved.json");

function load() {
  if (!existsSync(STORE)) return [];
  return JSON.parse(readFileSync(STORE, "utf8"));
}
function save(labels) {
  writeFileSync(STORE, JSON.stringify(labels, null, 2));
}

async function buildTree(labels) {
  const tree = await MerkleTree.create(LEVELS);
  for (const l of labels) tree.insert(BigInt(l));
  return tree;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const labels = load();

  if (cmd === "approve") {
    if (!arg) throw new Error("usage: approve <labelDecimal>");
    if (!labels.includes(arg)) labels.push(arg);
    save(labels);
    const tree = await buildTree(labels);
    console.log("approved:", arg);
    console.log("aspRoot :", toDec(await tree.root()));
  } else if (cmd === "root") {
    const tree = await buildTree(labels);
    console.log(toDec(await tree.root()));
  } else if (cmd === "proof") {
    if (!arg) throw new Error("usage: proof <labelDecimal>");
    const idx = labels.indexOf(arg);
    if (idx < 0) throw new Error("label not approved");
    const tree = await buildTree(labels);
    const p = await tree.proof(idx);
    console.log(
      JSON.stringify(
        {
          aspRoot: toDec(p.root),
          aspPathElements: p.pathElements.map(toDec),
          aspPathIndices: p.pathIndices.map((x) => toDec(x)),
        },
        null,
        2
      )
    );
  } else if (cmd === "list") {
    console.log(JSON.stringify(labels, null, 2));
  } else {
    console.log("usage: approve|root|proof|list");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
