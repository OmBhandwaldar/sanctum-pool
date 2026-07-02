// Generate a withdraw.circom witness input for a fresh note deposited into a
// one-leaf tree. Writes circuits/build/withdraw_input.json and prints the
// public values (root, nullifierHash) for reference.
//
// Usage: node client/src/genWithdrawInput.js [recipientFieldDecimal]
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createNote, commitmentOf, nullifierHashOf, labelOf } from "./note.js";
import { MerkleTree } from "./merkle.js";
import { toDec, randomField } from "./field.js";
import { genViewKeypair, encryptNote, blobToHex } from "./viewkey.js";
import { recipientField } from "./address.js";

const LEVELS = 20;

// Build a withdraw witness. When `approved` is true the note's label is placed
// in the ASP tree (a valid association-set membership proof exists); when false
// the ASP tree holds an unrelated label, so no valid proof exists and witness
// generation fails — demonstrating that a non-approved deposit cannot withdraw.
export async function buildWithdrawInput({ recipient = 12345n, approved = true } = {}) {
  const note = createNote();
  const commitment = await commitmentOf(note);
  const nullifierHash = await nullifierHashOf(note);
  const label = await labelOf(note);

  // state tree contains the commitment
  const tree = await MerkleTree.create(LEVELS);
  const index = tree.insert(commitment);
  const { root, pathElements, pathIndices } = await tree.proof(index);

  // ASP tree contains the approved label (or an unrelated one if denied)
  const aspTree = await MerkleTree.create(LEVELS);
  aspTree.insert(approved ? label : randomField());
  const asp = await aspTree.proof(0);

  const input = {
    root: toDec(root),
    aspRoot: toDec(asp.root),
    recipient: toDec(recipient),
    amount: toDec(note.amount),
    scope: toDec(note.scope),
    nullifier: toDec(note.nullifier),
    secret: toDec(note.secret),
    nonce: toDec(note.nonce),
    pathElements: pathElements.map(toDec),
    pathIndices: pathIndices.map((x) => toDec(x)),
    aspPathElements: asp.pathElements.map(toDec),
    aspPathIndices: asp.pathIndices.map((x) => toDec(x)),
  };

  return { input, note, commitment, nullifierHash, root, label, aspRoot: asp.root };
}

async function main() {
  // recipient is a Stellar strkey; the bound field is derived exactly as the
  // pool derives it on-chain (SHA-256(strkey) truncated to a field element).
  const recipientStrkey =
    process.argv[2] || "GDEMORECIPIENTPLACEHOLDERADDRESSXXXXXXXXXXXXXXXXXXXXXXXX";
  const approved = process.argv[3] !== "denied";
  const recipient = recipientField(recipientStrkey);
  const { input, commitment, nullifierHash, root, label, aspRoot } =
    await buildWithdrawInput({ recipient, approved });

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../../circuits/build/withdraw_input.json");
  writeFileSync(outPath, JSON.stringify(input, null, 2));

  // view-key selective disclosure: encrypt the note plaintext to an auditor's
  // viewing key and anchor it on-chain with the deposit.
  const { input: fullInput } = { input };
  const auditor = genViewKeypair();
  const notePlain = {
    amount: toDec(fullInput.amount),
    scope: toDec(fullInput.scope),
    nonce: toDec(fullInput.nonce),
    nullifier: toDec(fullInput.nullifier),
    secret: toDec(fullInput.secret),
    recipient: recipientStrkey,
    commitment: toDec(commitment),
  };
  const { blob, disclosureKey } = encryptNote(notePlain, auditor.vpk);

  const meta = {
    commitment: toDec(commitment),
    label: toDec(label),
    nullifierHash: toDec(nullifierHash),
    root: toDec(root),
    aspRoot: toDec(aspRoot),
    recipient: toDec(recipient),
    recipientStrkey,
    amount: toDec(input.amount),
    scope: toDec(input.scope),
    approved,
    encNote: blobToHex(blob),
    disclosureKey,
    auditorVsk: auditor.vsk,
    auditorVpk: auditor.vpk,
  };
  const metaPath = resolve(here, "../../circuits/build/withdraw_meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log("commitment   :", meta.commitment);
  console.log("nullifierHash:", meta.nullifierHash);
  console.log("root         :", meta.root);
  console.log("wrote        :", outPath);
  console.log("wrote        :", metaPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
