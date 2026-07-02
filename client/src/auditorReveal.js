// Auditor reveal: given an on-chain encrypted note (hex), a per-transaction
// disclosure key, and the on-chain commitment, decrypt that single note and
// prove it corresponds to the on-chain deposit.
//
// Usage: node client/src/auditorReveal.js <encNoteHex> <disclosureKey> <onchainCommitment>
import { blobFromHex, decryptWithDisclosureKey } from "./viewkey.js";
import { verifyDisclosure } from "./auditor.js";

async function main() {
  const [encHex, key, onchainCommitment] = process.argv.slice(2);
  if (!encHex || !key || !onchainCommitment) {
    console.error(
      "usage: auditorReveal.js <encNoteHex> <disclosureKey> <onchainCommitment>"
    );
    process.exit(1);
  }

  const blob = blobFromHex(encHex.replace(/^0x/, ""));
  const plain = decryptWithDisclosureKey(blob, key);
  const res = await verifyDisclosure(plain);
  const matchesChain = String(plain.commitment) === String(onchainCommitment);

  console.log("decrypted note:");
  console.log("  amount   :", plain.amount);
  console.log("  recipient:", plain.recipient);
  console.log("  commitment:", plain.commitment);
  console.log("commitment recomputed from plaintext ==  disclosed:", res.ok);
  console.log("disclosed commitment == on-chain commitment       :", matchesChain);

  if (!res.ok || !matchesChain) {
    console.error("DISCLOSURE VERIFICATION FAILED");
    process.exit(1);
  }
  console.log("AUDIT OK: this exact on-chain deposit is", plain.amount, "to", plain.recipient);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
