pragma circom 2.0.0;

include "poseidon.circom";
include "merkle.circom";

// Sanctum Pool — withdrawal circuit (M1: state membership + nullifier).
//
// Note scheme (fixed denomination):
//   precommitment = Poseidon(nullifier, secret)
//   label         = Poseidon(scope, nonce)
//   commitment    = Poseidon(amount, label, precommitment)   // leaf in state tree
//   nullifierHash = Poseidon(nullifier)                      // public, prevents double-spend
//
// This M1 version proves the note's commitment is in the state tree and
// reveals a correctly-derived nullifierHash, bound to a recipient. The ASP
// association-set membership check on `label` is added in M3.
//
// Public signals: nullifierHash (output), then root, recipient, amount, scope.
// `recipient` is bound into the constraint system so a relayer cannot swap it.
template Withdraw(levels) {
    // ---- public ----
    signal input root;        // state Merkle root
    signal input recipient;   // withdrawal destination (bound, anti-frontrunning)
    signal input amount;      // fixed denomination
    signal input scope;       // pool/asset domain separator

    // ---- private witness ----
    signal input nullifier;
    signal input secret;
    signal input nonce;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ---- output ----
    signal output nullifierHash;

    // precommitment = Poseidon(nullifier, secret)
    component pre = Poseidon(2);
    pre.inputs[0] <== nullifier;
    pre.inputs[1] <== secret;

    // label = Poseidon(scope, nonce)
    component lab = Poseidon(2);
    lab.inputs[0] <== scope;
    lab.inputs[1] <== nonce;

    // commitment = Poseidon(amount, label, precommitment)
    component com = Poseidon(3);
    com.inputs[0] <== amount;
    com.inputs[1] <== lab.out;
    com.inputs[2] <== pre.out;

    // nullifierHash = Poseidon(nullifier)
    component nh = Poseidon(1);
    nh.inputs[0] <== nullifier;
    nullifierHash <== nh.out;

    // state-tree membership of the commitment
    component merkle = MerkleProof(levels);
    merkle.leaf <== com.out;
    merkle.root <== root;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }

    // bind recipient into the proof (no logic effect, prevents malleation)
    signal recipientSquare;
    recipientSquare <== recipient * recipient;
}

component main {public [root, recipient, amount, scope]} = Withdraw(20);
