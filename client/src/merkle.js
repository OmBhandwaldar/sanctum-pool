// Poseidon Merkle tree matching circuits/merkle.circom (HashLeftRight = Poseidon(2)).
// Empty leaves are 0. pathIndices[i] = 0 if the current node is the left child.
import { poseidon } from "./poseidon.js";

export const ZERO_LEAF = 0n;

// Precompute the zero subtree hashes for each level.
export async function zeroHashes(levels) {
  const zeros = [ZERO_LEAF];
  for (let i = 1; i <= levels; i++) {
    zeros[i] = await poseidon([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

export class MerkleTree {
  constructor(levels, zeros) {
    this.levels = levels;
    this.zeros = zeros;
    this.leaves = [];
  }

  static async create(levels) {
    return new MerkleTree(levels, await zeroHashes(levels));
  }

  insert(leaf) {
    this.leaves.push(BigInt(leaf));
    return this.leaves.length - 1;
  }

  // Compute root and the Merkle proof for the leaf at `index`.
  async proof(index) {
    const pathElements = [];
    const pathIndices = [];
    let level = this.leaves.slice();
    let idx = index;

    for (let i = 0; i < this.levels; i++) {
      const isRight = idx % 2; // 1 => current node is right child
      const pairIdx = isRight ? idx - 1 : idx + 1;
      const sibling = pairIdx < level.length ? level[pairIdx] : this.zeros[i];
      pathElements.push(sibling);
      pathIndices.push(isRight);

      // build next level
      const next = [];
      for (let j = 0; j < level.length || j === 0; j += 2) {
        const left = j < level.length ? level[j] : this.zeros[i];
        const right = j + 1 < level.length ? level[j + 1] : this.zeros[i];
        next.push(await poseidon([left, right]));
        if (j + 2 >= level.length) break;
      }
      level = next.length ? next : [this.zeros[i + 1]];
      idx = Math.floor(idx / 2);
    }

    return { root: level[0], pathElements, pathIndices };
  }

  async root() {
    const { root } = await this.proof(0);
    return root;
  }
}
