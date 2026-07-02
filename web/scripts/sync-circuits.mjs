// Copy the compiled circuit artifacts into web/public so Vite can serve them.
// Runs automatically before `dev`/`build` (see package.json). Keeps the large
// wasm/zkey out of git — they live in circuits/ and are copied on demand.
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = resolve(here, "../public/circuits");
mkdirSync(outDir, { recursive: true });

const copies = [
  ["circuits/build/withdraw_js/withdraw.wasm", "withdraw.wasm"],
  ["circuits/keys/withdraw_final.zkey", "withdraw_final.zkey"],
  ["circuits/keys/withdraw_vk.json", "withdraw_vk.json"],
];

for (const [src, dst] of copies) {
  const from = resolve(root, src);
  if (!existsSync(from)) {
    console.warn(`[sync-circuits] missing ${src} — run scripts/build_circuit.sh + setup_circuit.sh`);
    continue;
  }
  copyFileSync(from, resolve(outDir, dst));
  console.log(`[sync-circuits] ${dst}`);
}
