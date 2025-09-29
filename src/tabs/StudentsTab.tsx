// src/tabs/StudentsTab.tsx
import { useEffect, useRef, useState } from 'react'
import { PERIODS, type PeriodId } from '../lib/constants'
import type { StudentsConfig, StudentMeta } from '../lib/types'
import { storage } from '../lib/storage'
import { syncStudentsFromManifests } from '../lib/data'
import { getDisplayName } from '../lib/utils'
import { broadcastStudentsUpdated } from '../lib/broadcast'

const ALLOWED_TAGS = ['front row', 'back row', 'near TB'] as const
type AllowedTag = typeof ALLOWED_TAGS[number]

/* -----------------------------------------------------------------------------
   Helpers
----------------------------------------------------------------------------- */

// Ensure the object always has arrays for all periods
function ensureStudentsShape(input: any): StudentsConfig {
  const base: StudentsConfig = { p1: [], p3: [], p4: [], p5: [], p6: [] }
  if (!input || typeof input !== 'object') return base
  const out: StudentsConfig = { ...base, ...input }
  for (const p of PERIODS) {
    if (!Array.isArray(out[p])) out[p] = []
  }
  return out
}

/** Add one student to a period's roster, no reshuffle */
function addStudentToPeriod(periodId: PeriodId, meta: StudentMeta) {
  const studentsCfg = storage.getStudents()
  const list = studentsCfg[periodId] || []

  // avoid duplicates by id
  if (list.some(s => s.id === meta.id)) return

  const nextCfg: StudentsConfig = { ...studentsCfg, [periodId]: [...list, meta] }
  storage.setStudents(nextCfg)

  // nudge other tabs to refresh
  try { localStorage.setItem('sc.bump.students', String(Date.now())) } catch {}
  try { localStorage.setItem('seating.bump.students', String(Date.now())) } catch {}

  // local broadcast
  broadcastStudentsUpdated()
}

/* Tiny, stateless field components for the Add Student form */
function PeriodPicker() {
  return (
    <div>
      <label htmlFor="add-period" className="block text-xs text-slate-500 mb-1">Period</label>
      <select id="add-period" defaultValue="p3" className="rounded-md border px-2 py-1.5 text-sm">
        {PERIODS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
      </select>
    </div>
  )
}
function NameField() {
  return (
    <div>
      <label htmlFor="add-name" className="block text-xs text-slate-500 mb-1">Student name</label>
      <input id="add-name" defaultValue="Jane Doe" className="w-44 rounded-md border px-2 py-1.5 text-sm" />
    </div>
  )
}
function FileIdField() {
  return (
    <div>
      <label htmlFor="add-fileid" className="block text-xs text-slate-500 mb-1">Photo filename (id)</label>
      <input id="add-fileid" defaultValue="Jane_Doe.png" className="w-56 rounded-md border px-2 py-1.5 text-sm" />
    </div>
  )
}
function DisplayNameField() {
  return (
    <div>
      <label htmlFor="add-display" className="block text-xs text-slate-500 mb-1">Display name (optional)</label>
      <input id="add-display" placeholder="Jane D." className="w-44 rounded-md border px-2 py-1.5 text-sm" />
    </div>
  )
}
function TagsField() {
  return (
    <div>
      <label htmlFor="add-tags" className="block text-xs text-slate-500 mb-1">Tags (optional)</label>
      <input id="add-tags" placeholder="back row, near TB" className="w-44 rounded-md border px-2 py-1.5 text-sm" />
    </div>
  )
}

/* -----------------------------------------------------------------------------
   Component
----------------------------------------------------------------------------- */

export default function StudentsTab() {
  const [cfg, setCfg] = useState<StudentsConfig>(() => ensureStudentsShape(storage.getStudents()))
  const [filter, setFilter] = useState('')

  // collapsed by default for all periods
  const [collapsed, setCollapsed] = useState<Record<PeriodId, boolean>>({
    p1: true, p3: true, p4: true, p5: true, p6: true,
  })

  // --- Sync progress UI state ---
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncPct, setSyncPct] = useState(0)
  const [syncLabel, setSyncLabel] = useState<string>('')

  // listen for external updates (e.g., sync from manifests) and cross-tab storage bumps
  useEffect(() => {
    const onUpdate = () => setCfg(ensureStudentsShape(storage.getStudents()))
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith('seating.')) return
      setCfg(ensureStudentsShape(storage.getStudents()))
    }
    window.addEventListener('seating:students-updated', onUpdate as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('seating:students-updated', onUpdate as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  async function handleSync() {
    try {
      setIsSyncing(true)
      setSyncPct(1)
      setSyncLabel('Starting…')
      await syncStudentsFromManifests((pct, label) => {
        setSyncPct(Math.max(1, Math.min(100, Math.round(pct))))
        setSyncLabel(label ?? '')
      })
      setCfg(ensureStudentsShape(storage.getStudents()))
      // notify other tabs/pages and period canvases
      broadcastStudentsUpdated()
      setSyncPct(100)
      setSyncLabel('Done')
    } catch {
      // leave any errors to existing console warnings inside sync
    } finally {
      setTimeout(() => {
        setIsSyncing(false)
        setSyncPct(0)
        setSyncLabel('')
      }, 350)
    }
  }

  function updateStudent(period: PeriodId, id: string, patch: Partial<StudentMeta>) {
    const next: StudentsConfig = JSON.parse(JSON.stringify(cfg))
    const list = next[period]
    const idx = list.findIndex((s) => s.id === id)
    if (idx === -1) return
    const curr = list[idx]

    // normalize displayName: if equal to file name, drop override
    let displayName = patch.displayName
    if (displayName !== undefined && displayName.trim() === curr.name.trim()) {
      displayName = undefined
    }
    list[idx] = {
      ...curr,
      ...patch,
      ...(displayName !== undefined ? { displayName } : { displayName: undefined })
    }

    storage.setStudents(next)
    setCfg(ensureStudentsShape(next))
    // broadcast after every write so other views refresh
    broadcastStudentsUpdated()
  }

  const filterLc = filter.trim().toLowerCase()
  const matches = (s: StudentMeta) =>
    !filterLc ||
    getDisplayName(s).toLowerCase().includes(filterLc) ||
    s.name.toLowerCase().includes(filterLc) ||
    s.id.toLowerCase().includes(filterLc)

  function setAll(collapsedAll: boolean) {
    setCollapsed({ p1: collapsedAll, p3: collapsedAll, p4: collapsedAll, p5: collapsedAll, p6: collapsedAll })
  }

  // ----- Export / Import roster (backup/restore) -----
  const fileRef = useRef<HTMLInputElement>(null)

  function mergeStudents(existing: StudentsConfig, incoming: StudentsConfig): StudentsConfig {
    const out: StudentsConfig = { ...existing }
    for (const p of PERIODS) {
      const byId = new Map<string, StudentMeta>()
      for (const s of existing[p]) byId.set(s.id, { ...s })
      for (const inc of incoming[p]) {
        const prev = byId.get(inc.id)
        if (prev) {
          byId.set(inc.id, {
            ...prev,
            name: inc.name ?? prev.name,
            displayName: inc.displayName ?? prev.displayName,
            notes: inc.notes ?? prev.notes,
            tags: Array.isArray(inc.tags) ? inc.tags.slice() : prev.tags,
          })
        } else {
          byId.set(inc.id, { ...inc })
        }
      }
      out[p] = Array.from(byId.values())
    }
    return out
  }

  async function onImportRoster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)

      // Use ensureStudentsShape on json.periods (preferred) or json
      const incoming = ensureStudentsShape(json?.periods ?? json)
      const replace = confirm('Replace ALL existing students with the imported file?\n\nClick "Cancel" to MERGE instead.')

      const next = replace
        ? incoming
        : mergeStudents(ensureStudentsShape(storage.getStudents()), incoming)

      storage.setStudents(next)
      setCfg(ensureStudentsShape(next))
      broadcastStudentsUpdated()
      alert(replace ? 'Roster replaced from file.' : 'Roster merged from file.')
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      e.currentTarget.value = ''
    }
  }

  function onExportRoster() {
    const data = ensureStudentsShape(storage.getStudents())
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      periods: data,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students-roster.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Students (Global)</h2>
        <button
          className={
            'ml-2 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 ' +
            (isSyncing ? 'opacity-60 cursor-not-allowed' : '')
          }
          onClick={handleSync}
          disabled={isSyncing}
          aria-busy={isSyncing}
          aria-live="polite"
        >
          {isSyncing ? 'Syncing…' : 'Sync from manifests'}
        </button>

        {/* Progress bar + spinner */}
        {isSyncing && (
          <div className="flex items-center gap-2">
            <div className="w-40 h-2 rounded bg-slate-200 overflow-hidden" aria-label="Sync progress">
              <div
                className="h-2 bg-slate-700 transition-all"
                style={{ width: `${Math.max(2, Math.min(100, syncPct))}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 min-w-[6rem]">{syncPct}% {syncLabel}</div>
            <svg
              className="animate-spin h-4 w-4 text-slate-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none" viewBox="0 0 24 24" role="img" aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/>
            </svg>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onImportRoster}
        />
        <button
          className={
            'px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 ' +
            (isSyncing ? 'opacity-60 cursor-not-allowed' : '')
          }
          onClick={onExportRoster}
          title="Download the current students roster as JSON"
          disabled={isSyncing}
        >
          Export roster JSON
        </button>
        <button
          className={
            'px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 ' +
            (isSyncing ? 'opacity-60 cursor-not-allowed' : '')
          }
          onClick={() => fileRef.current?.click()}
          title="Import a students roster JSON (replace or merge)"
          disabled={isSyncing}
        >
          Import roster JSON
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            onClick={() => setAll(false)}
            title="Expand all periods"
            disabled={isSyncing}
          >
            Expand all
          </button>
          <button
            className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            onClick={() => setAll(true)}
            title="Collapse all periods"
            disabled={isSyncing}
          >
            Collapse all
          </button>
          <input
            className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Search by name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={isSyncing}
          />
        </div>
      </div>

      {/* Add one student (simple form) */}
      <div className="p-2 border rounded-md flex flex-wrap items-end gap-2">
        <PeriodPicker />
        <NameField />
        <FileIdField />
        <DisplayNameField />
        <TagsField />
        <button
          type="button"
          className="ml-2 px-3 py-1.5 text-sm rounded-md border bg-white hover:bg-slate-50"
          onClick={() => {
            const period = (document.getElementById('add-period') as HTMLSelectElement)?.value as PeriodId
            const name = (document.getElementById('add-name') as HTMLInputElement)?.value.trim()
            const id = (document.getElementById('add-fileid') as HTMLInputElement)?.value.trim()
            const displayName = (document.getElementById('add-display') as HTMLInputElement)?.value.trim()
            const tagsStr = (document.getElementById('add-tags') as HTMLInputElement)?.value.trim()
            if (!period || !name || !id) return
            const meta: StudentMeta = {
              id,
              name,
              ...(displayName ? { displayName } : {}),
              tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
            }
            addStudentToPeriod(period, meta)
          }}
          title="Append a student to the selected period"
        >
          Add student
        </button>
      </div>

      {/* Period lists */}
      {PERIODS.map((p) => {
        const raw = Array.isArray(cfg[p]) ? cfg[p] : [] // guard
        const list = raw
          .slice()
          .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
          .filter(matches)
        const isCollapsed = collapsed[p]
        const totalCount = raw.length
        return (
          <div key={p} className="rounded-lg border border-slate-200 bg-white">
            <div className="px-3 py-2 border-b border-slate-200 text-sm font-medium flex items-center">
              <button
                className="mr-2 text-slate-600 hover:text-slate-900"
                onClick={() => setCollapsed(prev => ({ ...prev, [p]: !prev[p] }))}
                title={isCollapsed ? 'Expand' : 'Collapse'}
                disabled={isSyncing}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
              <span className="mr-2">{p.toUpperCase()} — {totalCount} students</span>
            </div>

            {!isCollapsed && (
              <div className="p-3 space-y-1">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 px-2 text-xs text-slate-500">
                  <div className="col-span-3">Display Name</div>
                  <div className="col-span-3">Photo Filename (id)</div>
                  <div className="col-span-3">Tags</div>
                  <div className="col-span-3">Notes</div>
                </div>

                {list.map((s) => (
                  <Row
                    key={s.id}
                    period={p}
                    student={s}
                    onChange={(patch) => updateStudent(p, s.id, patch)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* -----------------------------------------------------------------------------
   Row Component
----------------------------------------------------------------------------- */

function Row({
  period,
  student,
  onChange,
}: {
  period: PeriodId
  student: StudentMeta
  onChange: (patch: Partial<StudentMeta>) => void
}) {
  const displayValue = (student.displayName ?? student.name)

  function toggleTag(tag: AllowedTag) {
    const curr = Array.isArray(student.tags) ? student.tags.slice() : []
    const has = curr.includes(tag)
    const next = has ? curr.filter((t) => t !== tag) : [...curr, tag]
    onChange({ tags: next })
  }

  return (
    <div className="grid grid-cols-12 items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50">
      {/* Display Name (editable) */}
      <div className="col-span-3">
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={displayValue}
          placeholder={student.name}
          onChange={(e) => onChange({ displayName: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim()
            onChange({ displayName: v === student.name.trim() ? undefined : v })
          }}
        />
      </div>

      {/* Photo Filename (read-only id) */}
      <div className="col-span-3">
        <input
          className="w-full rounded-md border border-slate-200 bg-slate-100/60 px-2 py-1.5 text-sm text-slate-700"
          value={student.id}
          readOnly
          aria-readonly
          tabIndex={-1}
        />
      </div>

      {/* Tags (toggle chips) */}
      <div className="col-span-3">
        <div className="flex flex-wrap gap-1">
          {ALLOWED_TAGS.map((tag) => {
            const active = Array.isArray(student.tags) && student.tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={
                  'px-2 py-1 rounded border text-xs leading-none ' +
                  (active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                }
                onClick={() => toggleTag(tag)}
                title={tag}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Notes (single-row) */}
      <div className="col-span-3">
        <textarea
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm resize-none h-9"
          rows={1}
          placeholder="Behavior notes, accommodations, etc."
          value={student.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}
