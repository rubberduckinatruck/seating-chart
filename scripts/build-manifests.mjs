// scripts/build-manifests.mjs
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PERIODS = ["P1", "P3", "P4", "P5", "P6"];
const ROOT = "public/photos";

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

let wroteAny = false;

for (const period of PERIODS) {
  const dir = join(ROOT, period);
  ensureDir(dir);

  // Collect PNGs (adjust regex if you later add JPG/JPEG)
  let files = [];
  try {
    files = readdirSync(dir).filter(f => /\.png$/i.test(f));
  } catch {
    files = [];
  }

  // Stable order
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const outPath = join(dir, "index.json");
  const json = JSON.stringify(files, null, 2) + "\n";
  writeFileSync(outPath, json);
  wroteAny = true;
  console.log(`[manifest] ${period}: ${files.length} file(s) → ${outPath}`);
}

if (!wroteAny) {
  console.log("No manifests written (no period folders?).");
}
