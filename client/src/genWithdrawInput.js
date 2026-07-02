// Generate a withdraw.circom witness input for a fresh note deposited into a
// one-leaf tree. Writes circuits/build/withdraw_input.json and prints the
// public values (root, nullifierHash) for reference.
//
// Usage: node client/src/genWithdrawInput.js [recipientFieldDecimal]
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { toDec } from "./field.js";
import { genViewKeypair, encryptNote, blobToHex } from "./viewkey.js";
import { recipientField } from "./address.js";
import { buildWithdrawInput } from "./withdrawInput.js";

export { buildWithdrawInput };

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
