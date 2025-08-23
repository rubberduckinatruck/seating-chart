// scripts/build-manifests.mjs
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LABELS = ["p1", "p3", "p4", "p5", "p6"]; // logical period labels
const ROOT = "public/photos";

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

// choose a single on-disk folder for a given period:
// - if lowercase exists (e.g., p1), use that
// - else if uppercase exists (e.g., p1), use that
// - else create lowercase to avoid future dupes
function pickFolder(label) {
  const lower = join(ROOT, label.toLowerCase());
  const upper = join(ROOT, label);
  if (existsSync(lower)) return lower;
  if (existsSync(upper)) return upper;
  ensureDir(lower);
  return lower;
}

for (const label of LABELS) {
  const dir = pickFolder(label);

  // Collect images (png/jpg/jpeg)
  let files = [];
  try {
    files = readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  } catch {
    files = [];
  }

  // Stable order
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const outPath = join(dir, "index.json");
  const json = JSON.stringify(files, null, 2) + "\n";
  writeFileSync(outPath, json);

  console.log(`[manifest] ${label} → ${dir}: ${files.length} file(s)`);
}

console.log("Manifests generated under public/photos/*/index.json");
