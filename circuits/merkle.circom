pragma circom 2.0.0;

include "poseidon.circom";

// Hash two field elements with Poseidon(2). Must match the on-chain
// Poseidon parameterization used by the pool contract's Merkle tree.
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// Given a selector s in {0,1}, output (L,R) = s==0 ? (a,b) : (b,a).
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0; // enforce boolean
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

// Prove that `leaf` is included in a Merkle tree of depth `levels`
// whose root is `root`. pathIndices[i] = 0 if the current node is the
// left child at level i, 1 if it is the right child.
template MerkleProof(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component selectors[levels];
    component hashers[levels];

    signal levelHash[levels + 1];
    levelHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== levelHash[i];
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].out[0];
        hashers[i].right <== selectors[i].out[1];

        levelHash[i + 1] <== hashers[i].hash;
    }

    root === levelHash[levels];
}
