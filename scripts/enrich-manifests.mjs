#!/usr/bin/env node
// @ts-nocheck
/**
 * Manifest Enricher
 *
 * Scans public/photos/<period> folders for image files and (re)generates
 * public/photos/<period>/index.json with a normalized array of entries.
 * Also generates a top-level public/photos/index.json that aggregates the
 * filenames per period and includes a version stamp when content changes.
 *
 * Behavior:
 * - For NEW photos (no existing entry), creates an entry with placeholders:
 *   {
 *     "id": "<filename.ext>",
 *     "name": "<inferred from filename>",
 *     "displayName": "",
 *     "period": "<period folder>",
 *     "tags": [],
 *     "notes": ""
 *   }
 * - For EXISTING entries, preserves your edits, but normalizes shape:
 *   - Ensures all keys exist (displayName, tags, notes).
 *   - Filters tags to the allowed set: ["front row", "back row", "near TB"].
 * - Removes entries for images that no longer exist in the folder.
 * - Writes per-period manifests at public/photos/<period>/index.json.
 * - Writes a top-level aggregator at public/photos/index.json with:
 *     {
 *       "periods": ["p1","p3","p4","p5","p6"],
 *       "p1": ["fileA.jpg","fileB.jpg", ...],
 *       "p3": [...],
 *       ...
 *       "version": 1736963270000   // only updated when content changes
 *     }
 * - Keeps output stable and pretty-printed with a trailing newline.
 *
 * Flags:
 *   --check   Print which manifests would change; exit with code 1 if differences found.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const PHOTOS_DIR = path.join(ROOT, 'public', 'photos')
const TOP_INDEX_PATH = path.join(PHOTOS_DIR, 'index.json')

// Allowed image extensions and tags
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const ALLOWED_TAGS = new Set(['front row', 'back row', 'near TB'])

// CLI flags
const args = new Set(process.argv.slice(2))
const CHECK_ONLY = args.has('--check')

// ---------- IO helpers ----------
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
function writeJSON(file, data) {
  const json = JSON.stringify(data, null, 2) + '\n'
  fs.writeFileSync(file, json, 'utf8')
}

// ---------- FS walkers ----------
function listPeriods() {
  if (!fs.existsSync(PHOTOS_DIR)) return []
  return fs
    .readdirSync(PHOTOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
}

function listImages(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((n) => ALLOWED_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
}

// ---------- Normalization helpers ----------
function inferNameFromFilename(filename) {
  // Strip extension, replace underscores with spaces, title-case words simply
  const base = path.parse(filename).name.replaceAll('_', ' ').trim()
  // Light title-case without external deps
  return base
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeTags(maybeTags) {
  const tags = toArray(maybeTags).filter((t) => typeof t === 'string' && ALLOWED_TAGS.has(t))
  return tags
}

function normalizeEntry(period, filename, prev) {
  // Base fields
  const id = filename
  const name =
    typeof prev?.name === 'string' && prev.name.trim().length > 0
      ? prev.name
      : inferNameFromFilename(filename)
  const displayName = typeof prev?.displayName === 'string' ? prev.displayName : ''
  const notes = typeof prev?.notes === 'string' ? prev.notes : ''
  const tags = normalizeTags(prev?.tags)

  return {
    id,
    name,
    displayName,
    period,
    tags,
    notes,
  }
}

/**
 * Merge the current file list with an existing manifest, preserving edits,
 * adding placeholders for new photos, and dropping entries for missing photos.
 */
function mergeEntries(period, files, existing) {
  const prevById = new Map()
  if (Array.isArray(existing)) {
    for (const e of existing) {
      if (e && typeof e.id === 'string') prevById.set(e.id, e)
    }
  }

  const merged = []
  for (const filename of files) {
    const prev = prevById.get(filename)
    merged.push(normalizeEntry(period, filename, prev))
  }
  return merged
}

// ---------- Aggregator helpers ----------
/**
 * Build the top-level index.json "body" which is stable and comparable.
 * We intentionally do not include "version" in this object so we can compare
 * content-only changes. The version is added only when writing to disk and
 * only if the content differs from the previous file.
 */
function buildTopIndexBody(periods, perPeriodFiles) {
  const body = { periods: periods.slice() }
  for (const p of periods) {
    body[p] = (perPeriodFiles[p] || []).slice()
  }
  return body
}

function readTopIndexBody(file) {
  const json = readJSON(file)
  if (!json) return null
  const { version, ...rest } = json
  return rest
}

// ---------- Main ----------
function run() {
  let changed = false

  const periods = listPeriods()
  const perPeriodFiles = {}

  for (const period of periods) {
    const dir = path.join(PHOTOS_DIR, period)
    const files = listImages(dir)
    perPeriodFiles[period] = files
    const manifestPath = path.join(dir, 'index.json')
    const existing = readJSON(manifestPath)

    const next = mergeEntries(period, files, existing)
    const nextJson = JSON.stringify(next, null, 2) + '\n'
    const prevJson = existing ? JSON.stringify(existing, null, 2) + '\n' : null

    if (prevJson !== nextJson) {
      if (CHECK_ONLY) {
        console.log(`[diff] ${path.relative(ROOT, manifestPath)}`)
        changed = true
      } else {
        writeJSON(manifestPath, next)
        console.log(`[write] ${path.relative(ROOT, manifestPath)} (${next.length} entries)`)
      }
    }
  }

  // Build and compare the top-level aggregator
  const nextTopBody = buildTopIndexBody(periods, perPeriodFiles)
  const prevTopBody = readTopIndexBody(TOP_INDEX_PATH)
  const nextTopJsonBody = JSON.stringify(nextTopBody, null, 2) + '\n'
  const prevTopJsonBody = prevTopBody ? JSON.stringify(prevTopBody, null, 2) + '\n' : null

  if (prevTopJsonBody !== nextTopJsonBody) {
    if (CHECK_ONLY) {
      console.log(`[diff] ${path.relative(ROOT, TOP_INDEX_PATH)}`)
      changed = true
    } else {
      // Only bump version when content changed
      const toWrite = { ...nextTopBody, version: Date.now() }
      writeJSON(TOP_INDEX_PATH, toWrite)
      const periodCount = periods.length
      const fileCount = periods.reduce((acc, p) => acc + (perPeriodFiles[p]?.length || 0), 0)
      console.log(`[write] ${path.relative(ROOT, TOP_INDEX_PATH)} (periods=${periodCount}, files=${fileCount})`)
    }
  }

  if (CHECK_ONLY && changed) process.exitCode = 1
}

run()
