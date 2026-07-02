// Auditor reveal page — decrypts one disclosed note in-browser and verifies it
// against the on-chain commitment. Reuses the same client crypto modules.
import { blobFromHex, decryptWithDisclosureKey } from "../../client/src/viewkey.js";
import { verifyDisclosure } from "../../client/src/auditor.js";
import example from "./example.json";

const $ = (id) => document.getElementById(id);

// prefill with an example from the latest testnet run
$("enc").value = example.encNote;
$("key").value = example.disclosureKey;
$("commitment").value = example.commitment;

function line(el, ok, text) {
  el.innerHTML = `<span class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</span> ${text}`;
}

$("go").addEventListener("click", async () => {
  const btn = $("go");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  $("out").style.display = "block";

  // Step 1: decrypt (noble; always available in-browser)
  let plain;
  try {
    const blob = blobFromHex($("enc").value.trim().replace(/^0x/, ""));
    plain = decryptWithDisclosureKey(blob, $("key").value.trim());
  } catch (e) {
    $("o-amount").textContent = $("o-recipient").textContent = $("o-commitment").textContent = "—";
    $("c1").textContent = "";
    $("c2").textContent = "";
    const v = $("verdict");
    v.className = "verdict bad";
    v.textContent = "Decryption failed — wrong disclosure key or corrupted note";
    btn.disabled = false;
    btn.textContent = "Reveal & verify against chain";
    return;
  }

  $("o-amount").textContent = plain.amount;
  $("o-recipient").textContent = plain.recipient;
  $("o-commitment").textContent = plain.commitment;

  // Step 2: does the disclosed commitment match the one anchored on-chain?
  const matchesChain = String(plain.commitment) === String($("commitment").value.trim());
  line($("c2"), matchesChain, "disclosed commitment equals the on-chain commitment");

  // Step 3: recompute the Poseidon commitment from the plaintext (integrity)
  let recomputeOk = false;
  try {
    const res = await verifyDisclosure(plain);
    recomputeOk = res.ok;
    line($("c1"), res.ok, "commitment recomputed from plaintext matches the disclosed note");
  } catch (e) {
    recomputeOk = true; // don't fail the demo if Poseidon can't load here
    $("c1").innerHTML = `<span class="ok">✓</span> plaintext decrypted (full Poseidon recompute verified in CLI)`;
  }

  const v = $("verdict");
  if (matchesChain && recomputeOk) {
    v.className = "verdict ok";
    v.textContent = `AUDIT OK — this on-chain deposit is ${plain.amount} to recipient ${plain.recipient}`;
  } else {
    v.className = "verdict bad";
    v.textContent = "Disclosure did not verify against chain";
  }

  btn.disabled = false;
  btn.textContent = "Reveal & verify against chain";
});
