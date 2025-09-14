// src/tabs/StudentsTab.tsx
import { useEffect, useMemo, useState } from 'react'
import { PERIODS, type PeriodId } from '../lib/constants'
import type { StudentsConfig, StudentMeta } from '../lib/types'
import { storage } from '../lib/storage'
import { syncStudentsFromManifests } from '../lib/data'
import { getDisplayName } from '../lib/utils'

const ALLOWED_TAGS = ['front row', 'back row', 'near TB'] as const
type AllowedTag = typeof ALLOWED_TAGS[number]

export default function StudentsTab() {
  const [cfg, setCfg] = useState<StudentsConfig>(() => storage.getStudents())
  const [filter, setFilter] = useState('')

  // Keep in sync if another part of the app updates students
  useEffect(() => {
    const onUpdate = () => setCfg(storage.getStudents())
    window.addEventListener('students:updated', onUpdate)
    return () => window.removeEventListener('students:updated', onUpdate)
  }, [])

  async function handleSync() {
    await syncStudentsFromManifests()
    setCfg(storage.getStudents())
  }

  function updateStudent(period: PeriodId, id: string, patch: Partial<StudentMeta>) {
    const next: StudentsConfig = JSON.parse(JSON.stringify(cfg))
    const list = next[period]
    const idx = list.findIndex((s) => s.id === id)
    if (idx === -1) return
    const curr = list[idx]
    // If displayName is the same as name, don't store it (keeps data tidy)
    let displayName = patch.displayName
    if (displayName !== undefined && displayName.trim() === curr.name.trim()) {
      displayName = undefined
    }
    list[idx] = { ...curr, ...patch, ...(displayName !== undefined ? { displayName } : { displayName: undefined }) }
    storage.setStudents(next)
    setCfg(next)
  }

  const periods = useMemo(() => PERIODS, [])

  const filterLc = filter.trim().toLowerCase()
  const matches = (s: StudentMeta) =>
    !filterLc ||
    getDisplayName(s).toLowerCase().includes(filterLc) ||
    s.name.toLowerCase().includes(filterLc) ||
    s.id.toLowerCase().includes(filterLc)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Students (Global)</h2>
        <button
          className="ml-2 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          onClick={handleSync}
        >
          Sync from manifests
        </button>
        <div className="ml-auto">
          <input
            className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Search by name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {periods.map((p) => {
        const list = cfg[p].slice().sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))).filter(matches)
        return (
          <div key={p} className="rounded-lg border border-slate-200 bg-white">
            <div className="px-3 py-2 border-b border-slate-200 text-sm font-medium">
              {p.toUpperCase()} — {cfg[p].length} students
            </div>

            <div className="p-3 space-y-1">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 px-2 text-xs text-slate-500">
                <div className="col-span-3">Display Name</div>
                <div className="col-span-3">File Name</div>
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
          </div>
        )
      })}
    </div>
  )
}

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
            // If user cleared back to file name, drop the override
            const v = e.target.value.trim()
            onChange({ displayName: v === student.name.trim() ? undefined : v })
          }}
        />
      </div>

      {/* File Name (read-only) */}
      <div className="col-span-3">
        <input
          className="w-full rounded-md border border-slate-200 bg-slate-100/60 px-2 py-1.5 text-sm text-slate-700"
          value={student.name}
          readOnly
          aria-readonly
          tabIndex={-1}
        />
      </div>

      {/* Tags (compact toggle pills) */}
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

      {/* Notes (single-row textarea) */}
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
