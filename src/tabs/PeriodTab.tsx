// src/tabs/PeriodTab.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PeriodId } from '../lib/constants'
import { storage } from '../lib/storage'
import type {
  PeriodAssignments,
  RulesConfig,
  ExcludedSeats,
  StudentMeta,
} from '../lib/types'
import { getDisplayName } from '../lib/utils'
import PeriodSeat from '../components/PeriodSeat'
import AssignmentToolbar from '../components/AssignmentToolbar'
import RulesManager from '../components/RulesManager'
import { assignSeating, type AssignContext } from '../lib/assign'
import ExportButtons from '../components/ExportButtons'
import Fixture from '../components/Fixture'

export default function PeriodTab({ periodId }: { periodId: PeriodId }) {
  // force refresh when fixtures/students are broadcast-updated
  const [, setRefreshTick] = useState(0)
  useEffect(() => {
    function bump() { setRefreshTick(t => t + 1) }
    function onFx() { bump() }
    function onStudents() { bump() }
    function onStorage(e: StorageEvent) {
      if (!e.key || !e.key.startsWith('seating.')) return
      bump()
    }
    window.addEventListener('seating:fixtures-updated', onFx as EventListener)
    window.addEventListener('seating:students-updated', onStudents as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('seating:fixtures-updated', onFx as EventListener)
      window.removeEventListener('seating:students-updated', onStudents as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // snapshot config/state from storage
  const template = storage.getTemplate()
  const studentsCfg = storage.getStudents()
  const rulesCfg = storage.getRules()
  const excludedCfg = storage.getExcluded()
  const assignCfg = storage.getAssignments()

  // helpers based on current template
  function blankAssignments(): Record<string, string | null> {
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    return next
  }
  function buildAssignmentsForPeriod(pid: PeriodId): Record<string, string | null> {
    const saved = assignCfg[pid] || {}
    return { ...blankAssignments(), ...saved }
  }
  function buildExcludedForPeriod(pid: PeriodId): Set<string> {
    const savedArr = excludedCfg[pid] || []
    return new Set(savedArr)
  }
  function buildRulesForPeriod(pid: PeriodId): { together: [string, string][]; apart: [string, string][] } {
    const saved = rulesCfg[pid] || { together: [], apart: [] }
    return { together: saved.together.slice(), apart: saved.apart.slice() }
  }

  // local state per period
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => buildAssignmentsForPeriod(periodId)
  )
  const [excluded, setExcluded] = useState<Set<string>>(
    () => buildExcludedForPeriod(periodId)
  )
  const [rules, setRules] = useState<{ together: [string, string][]; apart: [string, string][] }>(
    () => buildRulesForPeriod(periodId)
  )
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [conflictNotes, setConflictNotes] = useState<string[]>([])

  // re-hydrate when period changes
  useEffect(() => {
    setAssignments(buildAssignmentsForPeriod(periodId))
    setExcluded(buildExcludedForPeriod(periodId))
    setRules(buildRulesForPeriod(periodId))
    setSelectedSeat(null)
    setConflictNotes([])
  }, [periodId])

  const students = useMemo(
    () =>
      studentsCfg[periodId]
        .slice()
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [studentsCfg, periodId]
  )

  const canvasRef = useRef<HTMLDivElement | null>(null)

  // persist helpers
  function persistAssignments(next: Record<string, string | null>) {
    const all: PeriodAssignments = storage.getAssignments()
    all[periodId] = next
    storage.setAssignments(all)
  }
  function persistExcluded(next: Set<string>) {
    const all: ExcludedSeats = storage.getExcluded()
    all[periodId] = Array.from(next)
    storage.setExcluded(all)
  }
  function persistRules(next: { together: [string, string][]; apart: [string, string][] }) {
    const all: RulesConfig = storage.getRules()
    all[periodId] = { together: next.together.slice(), apart: next.apart.slice() }
    storage.setRules(all)
  }

  // toolbar actions
  function clearAll() {
    const next = blankAssignments()
    setAssignments(next)
    persistAssignments(next)
  }
  function randomize() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'random')
    const next = blankAssignments()
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next)
    persistAssignments(next)
    setConflictNotes(res.conflicts)
  }
  function sortAlpha() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'alpha')
    const next = blankAssignments()
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next)
    persistAssignments(next)
    setConflictNotes(res.conflicts)
  }

  // seat interactions
  function onSeatClick(seatId: string) {
    if (selectedSeat === null) { setSelectedSeat(seatId); return }
    if (selectedSeat === seatId) { setSelectedSeat(null); return }
    const a = assignments[selectedSeat] ?? null
    const b = assignments[seatId] ?? null
    const next = { ...assignments, [selectedSeat]: b, [seatId]: a }
    setAssignments(next)
    persistAssignments(next)
    setSelectedSeat(null)
  }
  function toggleExcluded(seatId: string) {
    const next = new Set(excluded)
    if (next.has(seatId)) next.delete(seatId)
    else next.add(seatId)
    setExcluded(next)
    persistExcluded(next)
  }
  function unassignSeat(seatId: string) {
    const next = { ...assignments, [seatId]: null }
    setAssignments(next)
    persistAssignments(next)
  }
  function onDropStudent(toSeatId: string, studentId: string) {
    const fromSeatId = Object.keys(assignments).find(k => assignments[k] === studentId) || null
    const targetStudent = assignments[toSeatId] ?? null
    const next = { ...assignments }
    if (fromSeatId) next[fromSeatId] = targetStudent
    next[toSeatId] = studentId
    setAssignments(next)
    persistAssignments(next)
  }

  // rules helpers
  function addRule(kind: 'together' | 'apart', pair: [string, string]) {
    const next =
      kind === 'together'
        ? { ...rules, together: rules.together.concat([pair]) }
        : { ...rules, apart: rules.apart.concat([pair]) }
    setRules(next)
    persistRules(next)
  }
  function removeRule(kind: 'together' | 'apart', idx: number) {
    const next =
      kind === 'together'
        ? { ...rules, together: rules.together.filter((_, i) => i !== idx) }
        : { ...rules, apart: rules.apart.filter((_, i) => i !== idx) }
    setRules(next)
    persistRules(next)
  }

  // canvas sizing / centering
  const w = template.spacing.cardW
  const h = template.spacing.cardH
  const gridW = 3 * (2 * w + template.spacing.withinPair + template.spacing.betweenPairs)
  const gridH = 6 * (h + template.spacing.rowGap) + 100
  const outerW = Math.max(900, gridW + 200)
  const outerH = gridH
  const leftPad = Math.floor((outerW - gridW) / 2)

  const periodLabel = `Period ${periodId.slice(1)}`

  // Rules dropdown on header row
  const [openRules, setOpenRules] = useState(false)
  const rulesRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpenRules(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!openRules) return
      const n = e.target as Node
      if (rulesRef.current && !rulesRef.current.contains(n)) setOpenRules(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openRules])

  return (
    <div className="space-y-4">
      {/* HEADER ROW: title + assignment buttons + rules dropdown */}
      <div className="flex items-center gap-3 flex-wrap relative">
        <h2 className="text-lg font-semibold">{periodLabel}</h2>

        {/* Assignment toolbar moved up here */}
        <div className="flex items-center gap-2">
          <AssignmentToolbar
            onRandomize={randomize}
            onSortAlpha={sortAlpha}
            onClearAll={clearAll}
          />
          <ExportButtons targetSelector="#period-canvas" fileBase={`seating-${periodId}`} />
        </div>

        {/* Rules dropdown on same line, aligned right */}
        <div className="ml-auto relative" ref={rulesRef}>
          <button
            type="button"
            className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            onClick={() => setOpenRules(v => !v)}
            aria-expanded={openRules}
            aria-haspopup="dialog"
            title={openRules ? 'Collapse rules' : 'Expand rules'}
          >
            Rules {openRules ? '▴' : '▾'}
          </button>

          {openRules && (
            <div
              className="absolute right-0 mt-2 z-20 w-[min(720px,90vw)] rounded-lg border border-slate-200 bg-white shadow-lg p-3"
              role="dialog"
              aria-label="Rules"
            >
              <RulesManager
                students={students as StudentMeta[]}
                together={rules.together}
                apart={rules.apart}
                onAdd={addRule}
                onRemove={removeRule}
              />
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        id="period-canvas"
        ref={canvasRef}
        className="relative mx-auto border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
        style={{ width: outerW, height: outerH }}
      >
        <div className="absolute left-0 right-0 top-2 text-center text-xs text-slate-500">
          Front of classroom
        </div>

        {/* Fixtures layer (non-interactive) */}
        <div
          className="absolute top-0 pointer-events-none"
          style={{ left: leftPad, width: gridW, height: outerH }}
        >
          {template.fixtures?.map((f) => (
            <Fixture
              key={f.id}
              id={f.id}
              type={f.type as any}
              x={f.x}
              y={f.y}
              onMove={() => {}}
              onRemove={() => {}}
            />
          ))}
        </div>

        {/* Seats layer */}
        <div className="absolute top-0" style={{ left: leftPad, width: gridW, height: outerH }}>
          {template.desks.map(d => {
            const seatId = d.id
            const studentId = assignments[seatId] ?? null
            const s = studentId ? students.find(x => x.id === studentId) || null : null
            const name = s ? getDisplayName(s) : null
            return (
              <PeriodSeat
                key={seatId}
                periodId={periodId}
                seatId={seatId}
                x={d.x}
                y={d.y}
                w={w}
                h={h}
                tags={d.tags}
                isExcluded={excluded.has(seatId)}
                isSelected={selectedSeat === seatId}
                studentId={studentId}
                studentName={name}
                onClick={() => onSeatClick(seatId)}
                onToggleExclude={() => toggleExcluded(seatId)}
                onUnassign={() => unassignSeat(seatId)}
                onDropStudent={(sid) => onDropStudent(seatId, sid)}
                onDragStudentStart={() => {}}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
