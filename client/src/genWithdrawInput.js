// Generate a withdraw.circom witness input for a fresh note deposited into a
// one-leaf tree. Writes circuits/build/withdraw_input.json and prints the
// public values (root, nullifierHash) for reference.
//
// Usage: node client/src/genWithdrawInput.js [recipientFieldDecimal]
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createNote, commitmentOf, nullifierHashOf } from "./note.js";
import { MerkleTree } from "./merkle.js";
import { toDec } from "./field.js";

const LEVELS = 20;

export async function buildWithdrawInput({ recipient = 12345n } = {}) {
  const note = createNote();
  const commitment = await commitmentOf(note);
  const nullifierHash = await nullifierHashOf(note);

  const tree = await MerkleTree.create(LEVELS);
  const index = tree.insert(commitment);
  const { root, pathElements, pathIndices } = await tree.proof(index);

  const input = {
    root: toDec(root),
    recipient: toDec(recipient),
    amount: toDec(note.amount),
    scope: toDec(note.scope),
    nullifier: toDec(note.nullifier),
    secret: toDec(note.secret),
    nonce: toDec(note.nonce),
    pathElements: pathElements.map(toDec),
    pathIndices: pathIndices.map((x) => toDec(x)),
  };

  return { input, note, commitment, nullifierHash, root };
}

async function main() {
  const recipient = process.argv[2] ? BigInt(process.argv[2]) : 12345n;
  const { input, commitment, nullifierHash, root } = await buildWithdrawInput({
    recipient,
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../../circuits/build/withdraw_input.json");
  writeFileSync(outPath, JSON.stringify(input, null, 2));

  const meta = {
    commitment: toDec(commitment),
    nullifierHash: toDec(nullifierHash),
    root: toDec(root),
    recipient: toDec(recipient),
    amount: toDec(input.amount),
    scope: toDec(input.scope),
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
