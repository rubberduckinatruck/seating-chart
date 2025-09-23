// src/tabs/PeriodTab.tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PeriodId } from '../lib/constants'
import { storage } from '../lib/storage'
import type {
  PeriodAssignments,
  RulesConfig,
  StudentMeta,
  TemplateConfig,
} from '../lib/types'
import { getDisplayName } from '../lib/utils'
import PeriodSeat from '../components/PeriodSeat'
import AssignmentToolbar from '../components/AssignmentToolbar'
import RulesManager from '../components/RulesManager'
import ExportButtons from '../components/ExportButtons'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import StudentDragPreview from '../components/StudentDragPreview'
import { moveOrSwapStudent } from '../lib/moves'
import Fixture from '../components/Fixture'

/* --------------------------------- Helpers --------------------------------- */
function buildBlankAssignments(template: TemplateConfig): Record<string, string | null> {
  const next: Record<string, string | null> = {}
  for (const d of template.desks) next[d.id] = null
  return next
}
function buildAssignmentsForPeriod(
  template: TemplateConfig,
  savedAll: PeriodAssignments,
  periodId: PeriodId
): Record<string, string | null> {
  const saved = savedAll[periodId]
  if (!saved) return buildBlankAssignments(template)
  const next = buildBlankAssignments(template)
  for (const [seatId, studentId] of Object.entries(saved)) {
    if (seatId in next) next[seatId] = studentId
  }
  return next
}
function buildExcludedForPeriod(
  excludedMap: Record<string, string[]>,
  periodId: PeriodId
): Set<string> {
  const arr = (excludedMap && excludedMap[periodId]) || []
  return new Set(arr)
}
function buildRulesForPeriod(
  savedRules: RulesConfig,
  periodId: PeriodId
): { together: [string, string][], apart: [string, string][] } {
  const r = savedRules[periodId] || { together: [], apart: [] }
  return { together: r.together.slice(), apart: r.apart.slice() }
}

function randomAssign(
  template: TemplateConfig,
  students: StudentMeta[],
  excluded: Set<string>
): Record<string, string | null> {
  const seats = template.desks.map(d => d.id).filter(id => !excluded.has(id))
  const ids = students.map(s => s.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const next = buildBlankAssignments(template)
  for (let i = 0; i < seats.length; i++) next[seats[i]] = ids[i] ?? null
  return next
}
function alphaAssign(
  template: TemplateConfig,
  students: StudentMeta[],
  excluded: Set<string>
): Record<string, string | null> {
  const seats = template.desks.map(d => d.id).filter(id => !excluded.has(id))
  const sorted = [...students].sort((a, b) =>
    getDisplayName(a).localeCompare(getDisplayName(b))
  )
  const next = buildBlankAssignments(template)
  for (let i = 0; i < seats.length; i++) next[seats[i]] = sorted[i]?.id ?? null
  return next
}

/* -------------------------------- Component -------------------------------- */
export default function PeriodTab({ periodId }: { periodId: PeriodId }) {
  // bump UI when other tabs write to storage with sc.* OR seating.* keys
  const [, setRefreshTick] = useState(0)
  useEffect(() => {
    function bump() { setRefreshTick(t => t + 1) }
    function onStorage(e: StorageEvent) {
      if (!e.key) return
      const k = e.key
      const isOurKey = k.startsWith('sc.') || k.startsWith('seating.')
      if (!isOurKey) return
      bump()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // read current template (with desks, fixtures, spacing)
  const template = storage.getTemplate() as TemplateConfig
  const { cardW, cardH, withinPair, betweenPairs, rowGap } = template.spacing

  // replicate TemplateTab sizing math
  const gridW = 3 * (2 * cardW + withinPair + betweenPairs)
  const gridH = 6 * (cardH + rowGap) + 100
  const EXTRA = 350
  const outerW = Math.max(900, gridW + EXTRA)
  const outerH = gridH
  const leftPad = Math.floor((outerW - gridW) / 2)

  const studentsCfg = storage.getStudents()
  const rulesCfg = storage.getRules()
  const excludedMap = storage.getExcluded() as unknown as Record<string, string[]>
  const assignCfg = storage.getAssignments()

  // build local state from storage
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => buildAssignmentsForPeriod(template, assignCfg, periodId)
  )
  const [excluded, setExcluded] = useState<Set<string>>(
    () => buildExcludedForPeriod(excludedMap, periodId)
  )
  const [rules, setRules] = useState<{ together: [string, string][], apart: [string, string][] }>(
    () => buildRulesForPeriod(rulesCfg, periodId)
  )
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)

  // re-hydrate when periodId changes
  useEffect(() => {
    setAssignments(buildAssignmentsForPeriod(template, assignCfg, periodId))
    setExcluded(buildExcludedForPeriod(excludedMap, periodId))
    setRules(buildRulesForPeriod(rulesCfg, periodId))
    setSelectedSeat(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  const students: StudentMeta[] = studentsCfg[periodId] || []
  const periodLabel = `Period ${periodId.slice(1)}`

  // persistence helpers
  function persistAssignments(next: Record<string, string | null>) {
    const full = { ...assignCfg, [periodId]: next }
    storage.setAssignments(full)
    try { localStorage.setItem('sc.bump', String(Date.now())) } catch {}
    try { localStorage.setItem('seating.bump', String(Date.now())) } catch {}
  }
  function persistExcluded(next: Set<string>) {
    const arr = Array.from(next)
    const full = { ...excludedMap, [periodId]: arr }
    storage.setExcluded(full as any)
    try { localStorage.setItem('sc.bump', String(Date.now())) } catch {}
    try { localStorage.setItem('seating.bump', String(Date.now())) } catch {}
  }
  function persistRules(next: { together: [string, string][], apart: [string, string][] }) {
    const full: RulesConfig = { ...rulesCfg, [periodId]: next } as RulesConfig
    storage.setRules(full)
    try { localStorage.setItem('sc.bump', String(Date.now())) } catch {}
    try { localStorage.setItem('seating.bump', String(Date.now())) } catch {}
  }

  // assignment actions
  function randomize() {
    const next = randomAssign(template, students, excluded)
    setAssignments(next)
    persistAssignments(next)
  }
  function clearAll() {
    const next = buildBlankAssignments(template)
    setAssignments(next)
    persistAssignments(next)
    setSelectedSeat(null)
  }
  function sortAlpha() {
    const next = alphaAssign(template, students, excluded)
    setAssignments(next)
    persistAssignments(next)
  }

  // seat interactions: click-to-swap
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

  // ----- DnD (mouse-only) -----
  const sensors = useSensors(useSensor(PointerSensor))
  const [dragStudent, setDragStudent] = useState<{ id: string; name: string | null } | null>(null)

  function handleDragStart(e: any) {
    const sid = e.active?.id as string | undefined
    if (!sid) return
    const s = students.find(x => x.id === sid) || null
    setDragStudent({ id: sid, name: s ? getDisplayName(s) : null })
  }

  function handleDragEnd(e: DragEndEvent) {
    const sid = e.active?.id as string | undefined
    const overId = (e.over?.id as string | undefined) || null
    setDragStudent(null)
    if (!sid || !overId) return
    const res = moveOrSwapStudent(assignments, excluded, sid, overId)
    if (res.error === 'excluded') return
    if (res.next !== assignments) {
      setAssignments(res.next)
      persistAssignments(res.next)
    }
  }

  // Layout menu: sync from Template
  function syncLayoutFromTemplate() {
    const freshTemplate = storage.getTemplate() as TemplateConfig
    const baseline = buildBlankAssignments(freshTemplate)
    const nextAssign: Record<string, string | null> = { ...baseline }
    for (const seatId of Object.keys(baseline)) {
      if (seatId in assignments) nextAssign[seatId] = assignments[seatId]
    }
    const nextExcluded = new Set<string>()
    for (const seatId of Object.keys(baseline)) {
      if (excluded.has(seatId)) nextExcluded.add(seatId)
    }
    setAssignments(nextAssign)
    setExcluded(nextExcluded)
    const fullAssign = { ...storage.getAssignments(), [periodId]: nextAssign }
    storage.setAssignments(fullAssign)
    const exclMap = storage.getExcluded() as any as Record<string, string[]>
    const fullExcl = { ...exclMap, [periodId]: Array.from(nextExcluded) }
    storage.setExcluded(fullExcl as any)
    try { localStorage.setItem('sc.bump', String(Date.now())) } catch {}
    try { localStorage.setItem('seating.bump', String(Date.now())) } catch {}
  }

  const [layoutOpen, setLayoutOpen] = useState(false)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const n = e.target as Node
      if (layoutRef.current && !layoutRef.current.contains(n)) setLayoutOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // -------- Rules popover via PORTAL (always on top) --------
  const [rulesOpen, setRulesOpen] = useState(false)
  const rulesBtnRef = useRef<HTMLButtonElement | null>(null)
  const rulesPanelRef = useRef<HTMLDivElement | null>(null)
  const [rulesPos, setRulesPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!rulesOpen) return
    function compute() {
      if (!rulesBtnRef.current) return
      const r = rulesBtnRef.current.getBoundingClientRect()
      const PANEL_W = rulesPanelRef.current?.offsetWidth ?? 640
      const left = Math.max(8, r.right - PANEL_W)
      const top = Math.max(8, r.bottom + 8)
      setRulesPos({ top, left })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [rulesOpen])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rulesOpen) return
      const n = e.target as Node
      if (rulesBtnRef.current?.contains(n)) return
      if (rulesPanelRef.current?.contains(n)) return
      setRulesOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [rulesOpen])

  /* ------------------------------ Render ------------------------------ */
  return (
    <div className="space-y-3">
      {/* HEADER ROW */}
      <div className="flex items-center gap-2 flex-wrap relative transform origin-top-left scale-90 z-40">
        <h2 className="text-lg font-semibold">{periodLabel}</h2>

        <div className="flex items-center gap-2">
          <AssignmentToolbar
            onRandomize={randomize}
            onSortAlpha={sortAlpha}
            onClearAll={clearAll}
          />
          <ExportButtons targetSelector="#period-canvas" fileBase={`seating-${periodId}`} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Layout dropdown */}
          <div className="relative" ref={layoutRef}>
            <button
              type="button"
              className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              onClick={() => setLayoutOpen(v => !v)}
              aria-expanded={layoutOpen}
            >
              Layout ▾
            </button>
            {layoutOpen && (
              <div className="absolute right-0 z-50 mt-2 min-w-56 rounded-lg border bg-white p-2 shadow">
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-sm rounded hover:bg-slate-50"
                  onClick={() => { syncLayoutFromTemplate(); setLayoutOpen(false) }}
                >
                  Use current Template layout
                </button>
              </div>
            )}
          </div>

          {/* Rules button */}
          <button
            ref={rulesBtnRef}
            type="button"
            className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            onClick={() => setRulesOpen(v => !v)}
            aria-expanded={rulesOpen}
            aria-haspopup="dialog"
          >
            Rules ▾
          </button>
        </div>
      </div>

      {/* CANVAS */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          id="period-canvas"
          className="relative z-0 rounded-md border bg-slate-100 mx-auto shrink-0"
          style={{ width: outerW, height: outerH }}
        >
          {/* Board indicator */}
          <div className="absolute left-0 right-0 top-2 text-center text-xs text-slate-500 pointer-events-none">
            Front of classroom
          </div>

          {/* Inner layer */}
          <div className="absolute top-0" style={{ left: leftPad, width: gridW, height: outerH }}>
            {/* Fixtures (display-only on Period tab) */}
{template.fixtures.map(f => (
  <Fixture
    key={f.id}
    id={f.id}
    type={f.type}
    x={f.x}
    y={f.y}
    editable={false}
    onMove={() => {}}
    onRemove={() => {}}
  />
))}


            {/* Seats */}
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
                  w={cardW}
                  h={cardH}
                  tags={d.tags}
                  isExcluded={excluded.has(seatId)}
                  isSelected={selectedSeat === seatId}
                  studentId={studentId}
                  studentName={name}
                  onClick={() => onSeatClick(seatId)}
                  onToggleExclude={() => toggleExcluded(seatId)}
                />
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {dragStudent ? (
            <StudentDragPreview
              periodId={periodId}
              studentId={dragStudent.id}
              studentName={dragStudent.name}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* RULES PANEL PORTAL */}
      {rulesOpen && rulesPos && createPortal(
        <div
          ref={rulesPanelRef}
          className="fixed z-[1000] w-[640px] max-w-[95vw] rounded-lg border bg-white p-2 shadow-2xl"
          style={{ top: rulesPos.top, left: rulesPos.left }}
        >
          <div className="text-xs">
            <RulesManager
              students={students}
              together={rules.together}
              apart={rules.apart}
              onAdd={(k, pair) => {
                const n = { together: rules.together.slice(), apart: rules.apart.slice() }
                n[k].push(pair)
                setRules(n)
                persistRules(n)
              }}
              onRemove={(k, idx) => {
                const n = { together: rules.together.slice(), apart: rules.apart.slice() }
                n[k].splice(idx, 1)
                setRules(n)
                persistRules(n)
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
