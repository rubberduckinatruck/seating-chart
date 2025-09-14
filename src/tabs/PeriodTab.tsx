
import { useMemo, useState, useRef, useEffect } from 'react'
import type { PeriodId } from '../lib/constants'
import { storage } from '../lib/storage'
import type { PeriodAssignments, RulesConfig, ExcludedSeats, StudentMeta } from '../lib/types'
import { getDisplayName } from '../lib/utils'
import PeriodSeat from '../components/PeriodSeat'
import AssignmentToolbar from '../components/AssignmentToolbar'
import RulesManager from '../components/RulesManager'
import { assignSeating, type AssignContext } from '../lib/assign'
import ExportButtons from '../components/ExportButtons'

export default function PeriodTab({ periodId }: { periodId: PeriodId }) {
  const template = storage.getTemplate()
  const studentsCfg = storage.getStudents()
  const rulesCfg = storage.getRules()
  const excludedCfg = storage.getExcluded()
  const assignCfg = storage.getAssignments()

  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => ({ ...assignCfg[periodId] })
  )
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(excludedCfg[periodId])
  )
  const [rules, setRules] = useState<{ together: [string,string][], apart: [string,string][] }>(
    () => ({ ...rulesCfg[periodId] })
  )
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const students = useMemo(() => studentsCfg[periodId].slice().sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))), [studentsCfg, periodId])

  const [conflictNotes, setConflictNotes] = useState<string[]>([])
  const assignedCount = useMemo(() => Object.values(assignments).filter(Boolean).length, [assignments])

  const canvasRef = useRef<HTMLDivElement | null>(null)

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
  function persistRules(next: { together: [string,string][], apart: [string,string][] }) {
    const all: RulesConfig = storage.getRules()
    all[periodId] = { together: next.together.slice(), apart: next.apart.slice() }
    storage.setRules(all)
  }

  function clearAll() {
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    setAssignments(next); persistAssignments(next)
  }

  function randomize() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'random')
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next); persistAssignments(next); setConflictNotes(res.conflicts)
  }

  function sortAlpha() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'alpha')
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next); persistAssignments(next); setConflictNotes(res.conflicts)
  }

  function onSeatClick(seatId: string) {
    if (selectedSeat === null) { setSelectedSeat(seatId); return }
    if (selectedSeat === seatId) { setSelectedSeat(null); return }
    const a = assignments[selectedSeat] ?? null
    const b = assignments[seatId] ?? null
    const next = { ...assignments, [selectedSeat]: b, [seatId]: a }
    setAssignments(next); persistAssignments(next); setSelectedSeat(null)
  }

  function toggleExcluded(seatId: string) {
    const next = new Set(excluded)
    if (next.has(seatId)) next.delete(seatId); else next.add(seatId)
    setExcluded(next); persistExcluded(next)
  }

  function unassignSeat(seatId: string) {
    const next = { ...assignments, [seatId]: null }
    setAssignments(next); persistAssignments(next)
  }

  // Drag from student label onto another seat
  function onDropStudent(toSeatId: string, studentId: string) {
    // Move student to target seat (swap if target occupied)
    const fromSeatId = Object.keys(assignments).find(k => assignments[k] === studentId) || null
    const targetStudent = assignments[toSeatId] ?? null
    const next = { ...assignments }
    if (fromSeatId) next[fromSeatId] = targetStudent
    next[toSeatId] = studentId
    setAssignments(next); persistAssignments(next)
  }
  function onDragStudentStart(_studentId: string) { /* no-op, reserved for future */ }

  function addRule(kind: 'together' | 'apart', pair: [string,string]) {
    const next = { ...rules }
    if (kind === 'together') next.together = next.together.concat([pair])
    else next.apart = next.apart.concat([pair])
    setRules(next); persistRules(next)
  }
  function removeRule(kind: 'together' | 'apart', idx: number) {
    const next = { ...rules }
    if (kind === 'together') next.together = next.together.filter((_, i) => i !== idx)
    else next.apart = next.apart.filter((_, i) => i !== idx)
    setRules(next); persistRules(next)
  }

  const w = template.spacing.cardW
  const h = template.spacing.cardH

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{periodId.toUpperCase()}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="font-medium mb-2">Summary</div>
          <div>Assigned seats: {assignedCount} / {template.desks.length}</div>
          <div>Excluded seats: {excluded.size}</div>
          <div>Together rules: {rules.together.length}</div>
          <div>Apart rules: {rules.apart.length}</div>
          {conflictNotes.length > 0 && (
            <div className="mt-2 text-slate-600">
              <div className="font-medium text-red-600 mb-1">Conflicts</div>
              <ul className="list-disc pl-5">
                {conflictNotes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="font-medium mb-2">Assignment Tools</div>
          <AssignmentToolbar
            onRandomize={randomize}
            onSortAlpha={sortAlpha}
            onClearAll={clearAll}
          />
          <div className="mt-3">
            <ExportButtons targetSelector="#period-canvas" fileBase={`seating-${periodId}`} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="font-medium mb-2">Rules</div>
          <RulesManager
            students={students as StudentMeta[]}
            together={rules.together}
            apart={rules.apart}
            onAdd={addRule}
            onRemove={removeRule}
          />
        </div>
      </div>

      <div
        id="period-canvas"
        ref={canvasRef}
        className="relative border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
        style={{
          width: Math.max(900, 3 * (2 * template.spacing.cardW + template.spacing.withinPair + template.spacing.betweenPairs)),
          height: 6 * (template.spacing.cardH + template.spacing.rowGap) + 100,
        }}
      >
        <div className="absolute left-0 right-0 top-2 text-center text-xs text-slate-500">Front of classroom</div>

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
  )
}
