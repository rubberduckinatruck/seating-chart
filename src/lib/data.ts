
import { PERIODS, type PeriodId } from './constants'
import type { StudentsConfig, StudentMeta } from './types'
import { storage } from './storage'

async function fetchManifest(period: PeriodId): Promise<StudentMeta[]> {
  const url = `/photos/${period}/index.json`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load manifest for ${period}`)
  const data = await res.json()
  return (data as any[]).map((e) => ({
    id: String(e.id),
    name: String(e.name ?? (String(e.id || '').replaceAll('_',' ').replace(/\.(png|jpg|jpeg|webp)$/i,''))),
    displayName: e.displayName ? String(e.displayName) : undefined,
    // period in file is informational; roster is keyed by current period
    tags: Array.isArray(e.tags) ? e.tags.filter((t: any) => typeof t === 'string' && (t === 'front row' || t === 'back row' || t === 'near TB')) : undefined,
    notes: e.notes ? String(e.notes) : undefined,
  }))
}

export async function syncStudentsFromManifests(): Promise<StudentsConfig> {
  const local = storage.getStudents()
  const merged: StudentsConfig = { p1: [], p3: [], p4: [], p5: [], p6: [] }
  for (const period of PERIODS) {
    try {
      const remote = await fetchManifest(period)
      const mapLocal = new Map(local[period].map(s => [s.id, s]))
      const out: StudentMeta[] = []
      for (const r of remote) {
        const l = mapLocal.get(r.id)
        if (l) {
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
    } catch {
      merged[period] = local[period]
    }
  }
  storage.setStudents(merged)
  return merged
}
