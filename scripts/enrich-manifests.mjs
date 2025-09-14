
#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const PHOTOS_DIR = path.join(ROOT, 'public', 'photos')
const ALLOWED_EXT = new Set(['.png'])
const FIXED_TAGS = new Set(['front row','back row','near TB'])

const args = new Set(process.argv.slice(2))
const CHECK_ONLY = args.has('--check')

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}
function writeJSON(file, data) {
  const json = JSON.stringify(data, null, 2) + '\n'
  fs.writeFileSync(file, json, 'utf8')
}

function listPeriods() {
  return fs.readdirSync(PHOTOS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

function listImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(n => ALLOWED_EXT.has(path.extname(n).toLowerCase()))
}

function mergeEntries(period, files, existing) {
  const byId = new Map()
  if (Array.isArray(existing)) {
    for (const e of existing) if (e && e.id) byId.set(e.id, e)
  }
  const merged = []
  for (const f of files.sort((a,b) => a.localeCompare(b))) {
    const prev = byId.get(f)
    const baseName = path.parse(f).name.replaceAll('_',' ').trim()
    const cleanTags = (Array.isArray(prev?.tags) ? prev.tags.filter(t => FIXED_TAGS.has(t)) : [])
    merged.push({
      id: f,
      name: prev?.name ?? baseName,
      displayName: prev?.displayName ?? undefined,
      period,
      tags: cleanTags.length ? cleanTags : undefined,
      notes: prev?.notes ?? undefined
    })
  }
  return merged
}

function run() {
  let changed = false
  for (const period of listPeriods()) {
    const dir = path.join(PHOTOS_DIR, period)
    const files = listImages(dir)
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
  if (CHECK_ONLY && changed) process.exitCode = 1
}

run()
