// Pure builder for a withdraw.circom witness input — no side effects, so it is
// safe to import in the browser (the CLI wrapper lives in genWithdrawInput.js).
import { createNote, commitmentOf, nullifierHashOf, labelOf } from "./note.js";
import { MerkleTree } from "./merkle.js";
import { toDec, randomField } from "./field.js";

export const LEVELS = 20;

// When `approved` is true the note's label is placed in the ASP tree (a valid
// association-set membership proof exists); when false the ASP tree holds an
// unrelated label, so no valid proof exists and witness generation fails —
// demonstrating that a non-approved deposit cannot withdraw.
//
// For a real (multi-deposit) pool, pass `stateLeaves` (all pool commitments)
// and `aspLeaves` (all approved labels) so the roots match on-chain; omitting
// them builds a single-leaf tree, which is what the CLI demo uses.
export async function buildWithdrawInput({
  recipient = 12345n,
  approved = true,
  stateLeaves = null,
  aspLeaves = null,
} = {}) {
  const note = createNote();
  const commitment = await commitmentOf(note);
  const nullifierHash = await nullifierHashOf(note);
  const label = await labelOf(note);

  // state tree contains the commitment (plus any existing pool commitments)
  const tree = await MerkleTree.create(LEVELS);
  if (stateLeaves) for (const c of stateLeaves) tree.insert(BigInt(c));
  const index = tree.insert(commitment);
  const { root, pathElements, pathIndices } = await tree.proof(index);

  // ASP tree contains the approved label (or an unrelated one if denied)
  const aspTree = await MerkleTree.create(LEVELS);
  let aspIndex = 0;
  if (aspLeaves) {
    for (const l of aspLeaves) aspTree.insert(BigInt(l));
    aspIndex = approved ? aspTree.insert(label) : aspTree.insert(randomField());
  } else {
    aspTree.insert(approved ? label : randomField());
  }
  const asp = await aspTree.proof(aspIndex);

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
