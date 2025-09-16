// src/lib/data.ts
import { PERIODS, type PeriodId } from './constants'
import type { StudentsConfig, StudentMeta, PeriodAssignments } from './types'
import { storage } from './storage'
import { broadcastStudentsUpdated } from './broadcast'

type ProgressCb = (pct: number, label?: string) => void

// Join BASE_URL + path without using new URL on a relative base
function withBase(p: string) {
  const base = (import.meta.env && (import.meta.env as any).BASE_URL) || '/'
  return (
    (base.endsWith('/') ? base : base + '/') +
    p.replace(/^\/+/, '')
  )
  // If you prefer absolute URLs, use:
  // return new URL(
  //   p.replace(/^\/+/, ''),
  //   window.location.origin + (base.startsWith('/') ? base : '/' + base)
  // ).toString()
}

async function fetchManifest(period: PeriodId): Promise<StudentMeta[]> {
  const url = withBase(`photos/${period}/index.json`)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load manifest for ${period} (HTTP ${res.status})`)
  }
  const data = await res.json()
  return (data as any[]).map((e) => ({
    id: String(e.id),
    name: String(
      e.name ??
        String(e.id || '')
          .replaceAll('_', ' ')
          .replace(/\.(png|jpg|jpeg|webp)$/i, '')
    ),
    displayName: e.displayName ? String(e.displayName) : undefined,
    // period in file is informational; roster is keyed by current period
    tags: Array.isArray(e.tags)
      ? e.tags.filter(
          (t: any) =>
            typeof t === 'string' &&
            (t === 'front row' || t === 'back row' || t === 'near TB')
        )
      : undefined,
    notes: e.notes ? String(e.notes) : undefined,
  }))
}

// Optional: read top-level aggregator version if present (public/photos/index.json)
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

export async function syncStudentsFromManifests(onProgress?: ProgressCb): Promise<StudentsConfig> {
  const local = storage.getStudents()
  const merged: StudentsConfig = { p1: [], p3: [], p4: [], p5: [], p6: [] }

  const totalSteps = PERIODS.length + 2 // per-period merges + cleanup/broadcast
  const step = (i: number, label?: string) => {
    const pct = Math.min(100, Math.max(1, Math.round(((i) / totalSteps) * 100)))
    onProgress?.(pct, label)
  }

  step(0, 'Fetching')

  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i]
    try {
      const remote = await fetchManifest(period)
      const mapLocal = new Map(local[period].map((s) => [s.id, s]))
      const out: StudentMeta[] = []

      // Build from remote = source of truth for existence (adds + removes)
      for (const r of remote) {
        const l = mapLocal.get(r.id)
        if (l) {
          // Preserve local edits when present; fall back to remote placeholder values
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
      // If fetch fails, keep existing local data for this period
      merged[period] = local[period]
    }

    step(i + 1, `Merged ${period.toUpperCase()}`)
  }

  // Persist merged roster
  storage.setStudents(merged)

  // Auto-unassign seats whose student IDs no longer exist after merge
  try {
    const assignments = storage.getAssignments() as PeriodAssignments
    let anyChanged = false

    for (const pid of PERIODS) {
      const validIds = new Set(merged[pid].map((s) => s.id))
      const curr = { ...(assignments[pid] || {}) }
      let changed = false

      for (const seatId of Object.keys(curr)) {
        const sid = curr[seatId]
        if (sid && !validIds.has(sid)) {
          curr[seatId] = null
          changed = true
        }
      }

      if (changed) {
        assignments[pid] = curr
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

  // Remember manifest version if available (from top-level aggregator)
  try {
    const ver = await fetchTopIndexVersion()
    if (ver !== undefined) {
      localStorage.setItem('seating.photos.version', ver)
    }
  } catch {
    // ignore
  }

  // Notify the rest of the app (Students & Period tabs) to refresh
  try {
    broadcastStudentsUpdated()
  } catch {
    // ignore
  }

  onProgress?.(100, 'Done')
  return merged
}
