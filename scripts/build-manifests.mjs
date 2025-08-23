// scripts/build-manifests.mjs
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PERIODS = ["P1", "P3", "P4", "P5", "P6"];
const root = "public/photos";

let changed = false;

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

for (const p of PERIODS) {
  const dir = join(root, p);
  ensureDir(dir);

  // read all .png files (case-sensitive match; adjust if you need jpg, etc.)
  let files = [];
  try {
    files = readdirSync(dir).filter(f => /\.png$/i.test(f));
  } catch (e) {
    // folder may not exist yet; skip
    files = [];
  }

  // sort for stable output
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const outPath = join(dir, "index.json");
  const json = JSON.stringify(files, null, 2);

  // write always; git will decide if it changed
  writeFileSync(outPath, json + "\n");
  changed = true;
}

console.log("Manifests generated under public/photos/*/index.json");
