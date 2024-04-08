pragma circom 2.0.0;

include "./utils/mimc5sponge.circom";
include "./commitment_hasher.circom";

template Withdraw() {
    signal input root;
    signal input nullifierHash;
    signal input recipient;

    signal input secret[256];
    signal input nullifier[256];
    signal input hashPairings[10];
    signal input hashDirections[10];

    // check if the public variable (submitted) nullifierhash is equal to the output
    component cHasher = CommitmentHasher();
    cHasher.secret <== secret;
    cHasher.nullifier <== nullifier;

    // if not, it will end the execution.
    cHasher.nullifierHash === nullifierHash;

    // Check merkle tree hash path
    component leafHashers[10];

    signal currentHash[10+1];
    currentHash[0] <== cHasher.commitment;

    signal left[10];
    signal right[10];

    for(var i=0; i < 10; i++){
        // Will determine if sister nodes are to be placed before (if the hash being delt with a right)
        var d = hashDirections[i];

        leafHashers[i] = MiMC5Sponge(2);
        // This formula implementation is used to overcome the static nature of circom - since values are dynamic, circom will throw error.
        left[i] <== (1 - d) * currentHash[i];
        leafHashers[i].ins[0] <== left[i] - d + hashPairings[i];

        right[i] <== d * currentHash[i];
        leafHashers[i].ins[1] <== right[i] + (1 - d) * hashPairings[i];

        leafHashers[i].k <== cHasher.commitment;
        currentHash[i+1] <== leafHashers[i].o;

    }
    // If this matches, the merkle tree is successfully verified.
    root === currentHash[10];
    signal recipientSquare;
    // Since recipient are not part of any constraint, but this will make sure it is part of the final proof.
    recipientSquare <== recipient * recipient;
}

component main {public [root, nullifierHash, recipient]} = Withdraw();