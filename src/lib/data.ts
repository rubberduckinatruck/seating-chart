// src/lib/data.ts
// Loads per-period photo manifests, merges them with any local edits,
// persists into storage, cleans up invalid seat assignments, and
// broadcasts changes so Period/Students tabs refresh.

import { PERIODS, type PeriodId } from './constants'
import type { StudentsConfig, StudentMeta, PeriodAssignments } from './types'
import { storage } from './storage'
import { broadcastStudentsUpdated } from './broadcast'
import { withBase } from './withBase'

type ProgressCb = (pct: number, label?: string) => void

/**
 * Fetch and normalize one period's student manifest.
 * The index.json is expected under: /public/photos/<period>/index.json
 * Each entry can contain:
 *   - id (required; also used to infer a name if name/displayName missing)
 *   - name (optional; preferred)
 *   - displayName (optional)
 *   - tags (optional; filtered to allowed set)
 *   - notes (optional)
 */
async function fetchManifest(period: PeriodId): Promise<StudentMeta[]> {
  const url = withBase(`photos/${period}/index.json`)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load manifest for ${period} (HTTP ${res.status})`)
  }

  const data = await res.json()
  const arr = Array.isArray(data) ? (data as any[]) : []

  return arr.map((e) => {
    const id = String(e?.id ?? '')
    // Build a human name from name || id; avoid String.prototype.replaceAll for wider TS targets.
    const rawName = e?.name != null ? String(e.name) : id
    const name = rawName
      .split('_').join(' ')                         // replace all underscores with spaces
      .replace(/\.(png|jpg|jpeg|webp)$/i, '')       // strip common image extensions

    const displayName =
      e?.displayName != null && String(e.displayName).trim() !== ''
        ? String(e.displayName)
        : undefined

    const tags =
      Array.isArray(e?.tags)
        ? (e.tags as any[]).filter(
            (t) =>
              typeof t === 'string' &&
              (t === 'front row' || t === 'back row' || t === 'near TB')
          )
        : undefined

    const notes =
      e?.notes != null && String(e.notes).trim() !== ''
        ? String(e.notes)
        : undefined

    const meta: StudentMeta = {
      id,
      name,
      displayName,
      tags,
      notes,
    }
    return meta
  })
}

/**
 * Optional: fetch a top-level photos index to read a "version" string so
 * we can remember which manifest set is loaded.
 */
async function fetchTopIndexVersion(): Promise<string | undefined> {
  try {
    const url = withBase(`photos/index.json?_=${Date.now()}`)
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return undefined
    const json = await res.json()
    const v = (json as any)?.version
    return v === undefined ? undefined : String(v)
  } catch {
    return undefined
  }
}

/**
 * Sync all periods from their manifests, merge with any local edits,
 * persist, clean up invalid seat assignments, and broadcast an update.
 */
export async function syncStudentsFromManifests(onProgress?: ProgressCb): Promise<StudentsConfig> {
  const local = storage.getStudents()
  // Initialize merged with all periods present.
  const merged: StudentsConfig = { p1: [], p3: [], p4: [], p5: [], p6: [] }

  const totalSteps = PERIODS.length + 2 // per-period merges + finalize/broadcast
  const step = (i: number, label?: string) => {
    const pct = Math.min(100, Math.max(1, Math.round((i / totalSteps) * 100)))
    onProgress?.(pct, label)
  }

  step(0, 'Fetching')

  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i]
    try {
      const remote = await fetchManifest(period)
      const mapLocal = new Map(local[period].map((s) => [s.id, s]))
      const out: StudentMeta[] = []

      // Build from remote as source of truth for existence (adds + removes).
      for (const r of remote) {
        const l = mapLocal.get(r.id)
        if (l) {
          // Preserve local edits; fall back to remote placeholder values.
          out.push({
            id: r.id,
            name: l.name ?? r.name,
            displayName: l.displayName ?? r.displayName,
            tags: l.tags ?? r.tags,
            notes: l.notes ?? r.notes,
          })
        } else {
          out.push(r)
        }
      }

      merged[period] = out
    } catch (e: any) {
      console.warn(`sync: failed to fetch ${period}:`, e?.message || e)
      // If fetch fails, keep existing local data for this period.
      merged[period] = local[period]
    }

    step(i + 1, `Merged ${period.toUpperCase()}`)
  }

  // Persist merged roster.
  storage.setStudents(merged)

  // Auto-unassign seats whose student IDs no longer exist after merge.
  try {
    const assignments = storage.getAssignments() as PeriodAssignments
    let anyChanged = false

    for (const pid of PERIODS) {
      const validIds = new Set(merged[pid].map((s) => s.id))
      const current = { ...(assignments[pid] || {}) }
      let changed = false

      for (const seatId of Object.keys(current)) {
        const sid = current[seatId]
        if (sid && !validIds.has(sid)) {
          current[seatId] = null
          changed = true
        }
      }

      if (changed) {
        assignments[pid] = current
        anyChanged = true
      }
    }

    if (anyChanged) {
      storage.setAssignments(assignments)
    }
  } catch (e) {
    console.warn('sync: failed to auto-unassign removed students:', e)
  }

  step(PERIODS.length + 1, 'Finalizing')

  // Remember manifest version if available.
  try {
    const ver = await fetchTopIndexVersion()
    if (ver !== undefined) {
      // Write both legacy and new keys if you’re in the middle of a migration.
      try { localStorage.setItem('seating.photos.version', ver) } catch {}
      try { localStorage.setItem('sc.photos.version', ver) } catch {}
    }
  } catch {
    // ignore
  }

  // Notify the rest of the app (Students & Period tabs) to refresh.
  try {
    broadcastStudentsUpdated()
  } catch {
    // ignore
  }

  onProgress?.(100, 'Done')
  return merged
}
