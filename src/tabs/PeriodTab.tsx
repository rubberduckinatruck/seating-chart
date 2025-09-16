// src/tabs/PeriodTab.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { PERIODS, type PeriodId } from '../lib/constants'
import type { StudentsConfig, StudentMeta } from '../lib/types'
import { storage } from '../lib/storage'
import { getDisplayName } from '../lib/utils'
import { broadcastStudentsUpdated } from '../lib/broadcast'

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToWindowEdges } from '@dnd-kit/modifiers'

/* ----------------------------- Utilities/Types ----------------------------- */

type SeatingMap = Record<string, string | null> // seatId -> studentId|null

const ROWS = 6
const COLS = 6

function seatId(r: number, c: number) {
  return `r${r}c${c}`
}

function seatIds() {
  const ids: string[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) ids.push(seatId(r, c))
  return ids
}

// Ensure we always have arrays for all periods (defensive against undefined)
function ensureStudentsShape(input: any): StudentsConfig {
  const base: StudentsConfig = { p1: [], p3: [], p4: [], p5: [], p6: [] }
  if (!input || typeof input !== 'object') return base
  const out: StudentsConfig = { ...base, ...input }
  for (const p of PERIODS) {
    if (!Array.isArray(out[p])) out[p] = []
  }
  return out
}

/* --------------------------------- Component -------------------------------- */

export default function PeriodTab() {
  // Which period’s seating are we viewing
  const [periodId, setPeriodId] = useState<PeriodId>('p1')

  // Roster (global) — pulled from storage and kept in sync with Students tab
  const [cfg, setCfg] = useState<StudentsConfig>(() => ensureStudentsShape(storage.getStudents()))

  // Seating for the selected period
  const STORAGE_KEY = `seating.period.${periodId}` // keep "seating." prefix for storage listeners
  const [seating, setSeating] = useState<SeatingMap>(() => buildInitialSeating(cfg, periodId))

  // Drag overlay state
  const [activeStudent, setActiveStudent] = useState<StudentMeta | null>(null)

  // Sensors for drag interactions
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Keep roster in sync with external updates (student edits/imports, etc)
  useEffect(() => {
    const onUpdate = () => setCfg(ensureStudentsShape(storage.getStudents()))
    const onStorage = (e: StorageEvent) => {
      // React only when our namespace is touched
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

  // Rebuild seating whenever the selected period changes or students updated
  useEffect(() => {
    // Try to load saved seating for the new period
    const saved = storage.get<SeatingMap>(STORAGE_KEY)
    if (saved && typeof saved === 'object') {
      setSeating(normalizeSeating(saved)) // ensure all seats exist
      return
    }
    // Otherwise, auto-place roster into the first open seats
    const initial = buildInitialSeating(cfg, periodId)
    setSeating(initial)
    storage.set(STORAGE_KEY, initial)
  }, [periodId, cfg]) // eslint-disable-line react-hooks/exhaustive-deps

  // Student lookups for the active period
  const roster = useMemo(() => {
    const safe = ensureStudentsShape(cfg)
    const list = Array.isArray(safe[periodId]) ? safe[periodId] : []
    return list.slice().sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
  }, [cfg, periodId])

  const byId = useMemo(() => {
    const m = new Map<string, StudentMeta>()
    for (const s of roster) m.set(s.id, s)
    return m
  }, [roster])

  // Helpers
  function getStudentAtSeat(id: string): StudentMeta | null {
    const sid = seating[id]
    return sid ? (byId.get(sid) ?? null) : null
  }

  function swapSeats(fromSeat: string, toSeat: string) {
    setSeating(prev => {
      const next = { ...prev }
      const a = next[fromSeat]
      const b = next[toSeat]
      next[fromSeat] = b ?? null
      next[toSeat] = a ?? null
      storage.set(STORAGE_KEY, next)
      return next
    })
  }

  function moveToEmpty(fromSeat: string, toSeat: string, studentId: string) {
    setSeating(prev => {
      const next = { ...prev }
      next[fromSeat] = null
      next[toSeat] = studentId
      storage.set(STORAGE_KEY, next)
      return next
    })
  }

  function onDragEnd(evt: DragEndEvent) {
    const { active, over } = evt
    setActiveStudent(null)
    if (!over) return
    const fromSeat = active.data.current?.seatId as string | undefined
    const studentId = active.data.current?.studentId as string | undefined
    const toSeat = String(over.id)
    if (!fromSeat || !studentId) return
    if (fromSeat === toSeat) return
    const targetHasStudent = seating[toSeat] !== null
    if (targetHasStudent) swapSeats(fromSeat, toSeat)
    else moveToEmpty(fromSeat, toSeat, studentId)
  }

  // Any students not currently in seats?
  const seatedSet = useMemo(
    () => new Set(Object.values(seating).filter(Boolean) as string[]),
    [seating]
  )
  const unseated = useMemo(
    () => roster.filter(s => !seatedSet.has(s.id)),
    [roster, seatedSet]
  )

  const firstEmptySeat = useMemo(
    () => seatIds().find(id => seating[id] === null) ?? null,
    [seating]
  )

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-2xl font-semibold">Seating</h2>
        <PeriodPicker value={periodId} onChange={(p) => setPeriodId(p)} />
        <div className="ml-auto text-sm text-slate-600">
          {roster.length} students • {countFilled(seating)} filled / {ROWS * COLS} seats
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          const s = e.active.data.current?.student as StudentMeta | undefined
          if (s) setActiveStudent(s)
        }}
        onDragEnd={onDragEnd}
        modifiers={[restrictToParentElement, restrictToWindowEdges]}
      >
        <div className="relative rounded-2xl bg-white shadow p-4 border border-slate-200">
          <Grid seating={seating} getStudentAtSeat={getStudentAtSeat} />
        </div>

        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeStudent ? <StudentCard student={activeStudent} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {unseated.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Unseated</h3>
          <div className="flex flex-wrap gap-3">
            {unseated.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  if (!firstEmptySeat) return
                  setSeating(prev => {
                    const next = { ...prev }
                    next[firstEmptySeat] = s.id
                    storage.set(STORAGE_KEY, next)
                    return next
                  })
                }}
                className="rounded-xl border bg-white hover:bg-slate-50 px-3 py-2 flex items-center gap-2 text-left shadow-sm"
                title="Place in first available seat"
              >
                <Avatar student={s} />
                <span className="text-sm">{getDisplayName(s)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ Presentational ------------------------------ */

function Grid({ seating, getStudentAtSeat }: {
  seating: SeatingMap
  getStudentAtSeat: (seatId: string) => StudentMeta | null
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
    >
      {seatIds().map(id => (
        <Seat key={id} id={id}>
          {(() => {
            const s = getStudentAtSeat(id)
            return s ? <DraggableStudent seatId={id} student={s} /> : <EmptySeatBadge />
          })()}
        </Seat>
      ))}
    </div>
  )
}

function Seat({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`h-28 rounded-xl border flex items-center justify-center transition
        ${isOver ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300'}
        bg-slate-50`}
      aria-label={`Seat ${id}`}
    >
      {children}
    </div>
  )
}

function EmptySeatBadge() {
  return <div className="text-slate-400 text-sm select-none">Empty</div>
}

function DraggableStudent({ student, seatId }: { student: StudentMeta; seatId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student:${student.id}`,
    data: { studentId: student.id, seatId, student },
  })
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StudentCard student={student} dragging={isDragging} />
    </div>
  )
}

function StudentCard({ student, dragging }: { student: StudentMeta; dragging?: boolean }) {
  return (
    <div
      className={`w-[150px] h-[72px] rounded-xl border bg-white shadow-sm px-3 py-2 flex items-center gap-3
        ${dragging ? 'opacity-90 scale-[1.02]' : 'hover:shadow'} transition`}
    >
      <Avatar student={student} />
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{getDisplayName(student)}</div>
        <div className="text-xs text-slate-500">Drag to move</div>
      </div>
    </div>
  )
}

function Avatar({ student }: { student: StudentMeta }) {
  const initials = getInitials(getDisplayName(student))
  return (
    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm">
      {initials}
    </div>
  )
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodId
  onChange: (p: PeriodId) => void
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null)
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="period-picker" className="text-sm text-slate-600">Period</label>
      <select
        id="period-picker"
        ref={selectRef}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodId)}
      >
        {PERIODS.map(p => (
          <option key={p} value={p}>{p.toUpperCase()}</option>
        ))}
      </select>
    </div>
  )
}

/* ---------------------------------- Helpers --------------------------------- */

function buildInitialSeating(cfg: StudentsConfig, periodId: PeriodId): SeatingMap {
  const initial: SeatingMap = {}
  for (const id of seatIds()) initial[id] = null
  const safe = ensureStudentsShape(cfg)
  const list = Array.isArray(safe[periodId]) ? safe[periodId] : []
  // Auto-place all students into first N seats (stable, deterministic)
  let idx = 0
  const ids = seatIds()
  for (const s of list) {
    if (idx >= ids.length) break
    initial[ids[idx++]] = s.id
  }
  return initial
}

function normalizeSeating(input: SeatingMap): SeatingMap {
  const out: SeatingMap = {}
  const ids = new Set(seatIds())
  for (const id of seatIds()) out[id] = null
  for (const [k, v] of Object.entries(input)) {
    if (ids.has(k)) out[k] = v ?? null
  }
  return out
}

function countFilled(seating: SeatingMap) {
  let n = 0
  for (const k of Object.keys(seating)) if (seating[k]) n++
  return n
}

function getInitials(name: string) {
  return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
}
