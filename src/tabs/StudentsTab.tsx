
import { useEffect, useState } from 'react'
import { FIXED_STUDENT_TAGS, PERIODS, type PeriodId } from '../lib/constants'
import { storage } from '../lib/storage'
import type { StudentMeta, StudentsConfig } from '../lib/types'
import { getDisplayName, toggleInArray } from '../lib/utils'
import { syncStudentsFromManifests } from '../lib/data'

export default function StudentsTab() {
  const [students, setStudents] = useState<StudentsConfig>(() => storage.getStudents())
  const [collapsed, setCollapsed] = useState<Record<PeriodId, boolean>>({ p1: true, p3: true, p4: true, p5: true, p6: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const total = PERIODS.reduce((acc, p) => acc + students[p].length, 0)
    if (total === 0) {
      handleSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updatePeriod(period: PeriodId, updater: (list: StudentMeta[]) => StudentMeta[]) {
    const next: StudentsConfig = { ...students, [period]: updater(students[period]) }
    setStudents(next)
    storage.setStudents(next)
  }

  async function handleSync() {
    setLoading(true); setError(null)
    try {
      const next = await syncStudentsFromManifests()
      setStudents(next)
    } catch (e: any) {
      setError(e?.message || 'Failed to sync')
    } finally {
      setLoading(false)
    }
  }

  function onEditName(period: PeriodId, id: string, value: string) {
    updatePeriod(period, (list) => list.map(s => s.id === id ? { ...s, name: value } : s))
  }

  function onEditDisplay(period: PeriodId, id: string, value: string) {
    updatePeriod(period, (list) => list.map(s => s.id === id ? { ...s, displayName: value } : s))
  }

  function onToggleTag(period: PeriodId, id: string, tag: typeof FIXED_STUDENT_TAGS[number]) {
    updatePeriod(period, (list) => list.map(s => {
      if (s.id !== id) return s
      const tags = s.tags ?? []
      return { ...s, tags: toggleInArray(tags, tag) }
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Students (Global)</h2>
        <button
          onClick={handleSync}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? 'Syncing…' : 'Sync from manifests'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {PERIODS.map((p) => (
        <div key={p} className="rounded-lg border border-slate-200 bg-white">
          <button
            onClick={() => setCollapsed(c => ({ ...c, [p]: !c[p] }))}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between"
          >
            <span className="font-medium">{p.toUpperCase()} — {students[p].length} students</span>
            <span className="text-slate-500 text-sm">{collapsed[p] ? 'Expand' : 'Collapse'}</span>
          </button>
          {!collapsed[p] && (
            <div className="divide-y divide-slate-100">
              {students[p].length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-500">No students found in manifests.</div>
              )}
              {students[p].map((s) => (
                <div key={s.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Shown name</div>
                    <div className="font-medium">{getDisplayName(s)}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Official name</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={s.name}
                      onChange={(e) => onEditName(p, s.id, e.target.value)}
                    />
                    <label className="block text-xs text-slate-500 mt-3 mb-1">Preferred (displayName)</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="e.g., CJ Johnson"
                      value={s.displayName ?? ''}
                      onChange={(e) => onEditDisplay(p, s.id, e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {FIXED_STUDENT_TAGS.map((tag) => {
                        const active = (s.tags ?? []).includes(tag)
                        return (
                          <button
                            key={tag}
                            onClick={() => onToggleTag(p, s.id, tag)}
                            className={
                              'px-2.5 py-1.5 rounded-md text-xs border ' +
                              (active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                            }
                            type="button"
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
