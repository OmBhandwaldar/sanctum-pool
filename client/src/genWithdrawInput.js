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

  console.log("commitment   :", toDec(commitment));
  console.log("nullifierHash:", toDec(nullifierHash));
  console.log("root         :", toDec(root));
  console.log("wrote        :", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
