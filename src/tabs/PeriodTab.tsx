// src/tabs/PeriodTab.tsx
import { useMemo, useRef, useState } from 'react'
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

export default function PeriodTab({ periodId }: { periodId: PeriodId }) {
  // snapshot config/state from storage
  const template = storage.getTemplate()
  const studentsCfg = storage.getStudents()
  const rulesCfg = storage.getRules()
  const excludedCfg = storage.getExcluded()
  const assignCfg = storage.getAssignments()

  // local state per period
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => ({ ...assignCfg[periodId] })
  )
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(excludedCfg[periodId])
  )
  const [rules, setRules] = useState<{ together: [string, string][]; apart: [string, string][] }>(
    () => ({ ...rulesCfg[periodId] })
  )
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [conflictNotes, setConflictNotes] = useState<string[]>([]) // kept for future UI

  const students = useMemo(
    () =>
      studentsCfg[periodId]
        .slice()
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [studentsCfg, periodId]
  )

  const canvasRef = useRef<HTMLDivElement | null>(null)

  // ----- persist helpers -----
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

  // ----- toolbar actions -----
  function clearAll() {
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    setAssignments(next)
    persistAssignments(next)
  }

  function randomize() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'random')
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next)
    persistAssignments(next)
    setConflictNotes(res.conflicts)
  }

  function sortAlpha() {
    const ctx: AssignContext = { template, students, excluded, rules }
    const res = assignSeating(ctx, 'alpha')
    const next: Record<string, string | null> = {}
    for (const d of template.desks) next[d.id] = null
    for (const [sid, seatId] of res.seatOf.entries()) next[seatId] = sid
    setAssignments(next)
    persistAssignments(next)
    setConflictNotes(res.conflicts)
  }

  // ----- seat interactions -----
  function onSeatClick(seatId: string) {
    if (selectedSeat === null) {
      setSelectedSeat(seatId)
      return
    }
    if (selectedSeat === seatId) {
      setSelectedSeat(null)
      return
    }
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

  // drag from student list onto a seat
  function onDropStudent(toSeatId: string, studentId: string) {
    const fromSeatId = Object.keys(assignments).find(k => assignments[k] === studentId) || null
    const targetStudent = assignments[toSeatId] ?? null
    const next = { ...assignments }
    if (fromSeatId) next[fromSeatId] = targetStudent
    next[toSeatId] = studentId
    setAssignments(next)
    persistAssignments(next)
  }
  function onDragStudentStart(_studentId: string) {
    /* no-op for now */
  }

  // ----- rules helpers (fixes "addRule is not defined") -----
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

  // ----- canvas sizing / centering -----
  const w = template.spacing.cardW
  const h = template.spacing.cardH
  const gridW = 3 * (2 * w + template.spacing.withinPair + template.spacing.betweenPairs)
  const gridH = 6 * (h + template.spacing.rowGap) + 100
  const outerW = Math.max(900, gridW + 200) // extra usable margin left/right
  const outerH = gridH
  const leftPad = Math.floor((outerW - gridW) / 2)

  // header label
  const periodLabel = `Period ${periodId.slice(1)}`

  // collapsible states (default collapsed)
  const [openTools, setOpenTools] = useState(false)
  const [openRules, setOpenRules] = useState(false)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{periodLabel}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Assignment Tools (collapsible) */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Assignment Tools</div>
            <button
              type="button"
              className="px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              onClick={() => setOpenTools(v => !v)}
              aria-expanded={openTools}
            >
              {openTools ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {openTools && (
            <>
              <div className="mt-2">
                <AssignmentToolbar
                  onRandomize={randomize}
                  onSortAlpha={sortAlpha}
                  onClearAll={clearAll}
                />
              </div>
              <div className="mt-3">
                <ExportButtons targetSelector="#period-canvas" fileBase={`seating-${periodId}`} />
              </div>
            </>
          )}
        </div>

        {/* Rules (collapsible) */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Rules</div>
            <button
              type="button"
              className="px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              onClick={() => setOpenRules(v => !v)}
              aria-expanded={openRules}
            >
              {openRules ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {openRules && (
            <div className="mt-2">
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

      {/* Outer canvas centered, inner layer offsets the grid so margins are usable */}
      <div
        id="period-canvas"
        ref={canvasRef}
        className="relative mx-auto border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
        style={{ width: outerW, height: outerH }}
      >
        <div className="absolute left-0 right-0 top-2 text-center text-xs text-slate-500">
          Front of classroom
        </div>

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
