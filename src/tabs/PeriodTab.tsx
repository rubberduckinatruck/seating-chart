// src/tabs/PeriodTab.tsx
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, KeyboardSensor } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { storage } from "../lib/storage";

type Student = {
  id: string;
  name: string;
  photo?: string;
};

type SeatingMap = Record<string, string | null>; // seatId -> studentId|null

// Configure your grid here
const ROWS = 6;
const COLS = 6;

// Build seat ids like "r0c0", "r0c1", ...
function seatId(r: number, c: number) {
  return `r${r}c${c}`;
}

function seatIds() {
  const ids: string[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) ids.push(seatId(r, c));
  return ids;
}

type PeriodTabProps = {
  periodId: string;                // logical id for storage (e.g., "p1")
  students: Student[];             // roster for this period
  title?: string;
};

export default function PeriodTab({ periodId, students, title = "Seating" }: PeriodTabProps) {
  const STORAGE_KEY = `period:${periodId}:seating`;

  // Build initial blank seating, then hydrate from storage
  const blankSeating: SeatingMap = useMemo(() => {
    const base: SeatingMap = {};
    for (const id of seatIds()) base[id] = null;
    return base;
  }, []);

  const [seating, setSeating] = useState<SeatingMap>(blankSeating);
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);

  // For quick demo, auto-place any unseated students into first open seats
  // (If you already assign seats elsewhere, you can remove this bit)
  useEffect(() => {
    const saved = storage.get<SeatingMap>(STORAGE_KEY);
    if (saved) {
      setSeating(saved);
      return;
    }
    const next = { ...blankSeating };
    const unfilled = seatIds();
    let idx = 0;
    for (const s of students) {
      // skip if already seated (shouldn’t happen on first run)
      if (Object.values(next).includes(s.id)) continue;
      // find next open
      while (idx < unfilled.length && next[unfilled[idx]] !== null) idx++;
      if (idx < unfilled.length) next[unfilled[idx]] = s.id;
    }
    setSeating(next);
    storage.set(STORAGE_KEY, next);
  }, [STORAGE_KEY, blankSeating, students]);

  // Build lookup for convenience
  const byId = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function getStudentAtSeat(id: string): Student | null {
    const sid = seating[id];
    return sid ? byId.get(sid) ?? null : null;
    }
  
  function swapSeats(fromSeat: string, toSeat: string) {
    setSeating(prev => {
      const next = { ...prev };
      const a = next[fromSeat];
      const b = next[toSeat];
      next[fromSeat] = b ?? null;
      next[toSeat] = a ?? null;
      storage.set(STORAGE_KEY, next);
      return next;
    });
  }

  function moveToEmpty(fromSeat: string, toSeat: string, studentId: string) {
    setSeating(prev => {
      const next = { ...prev };
      next[fromSeat] = null;
      next[toSeat] = studentId;
      storage.set(STORAGE_KEY, next);
      return next;
    });
  }

  function onDragEnd(evt: DragEndEvent) {
    const { active, over } = evt;
    setActiveStudent(null);
    if (!over) return;

    // metadata set on draggable
    const fromSeat = active.data.current?.seatId as string | undefined;
    const studentId = active.data.current?.studentId as string | undefined;
    const toSeat = String(over.id);

    if (!fromSeat || !studentId) return;
    if (fromSeat === toSeat) return;

    const targetHasStudent = seating[toSeat] !== null;

    if (targetHasStudent) {
      swapSeats(fromSeat, toSeat);
    } else {
      moveToEmpty(fromSeat, toSeat, studentId);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          const s = e.active.data.current?.student as Student | undefined;
          if (s) setActiveStudent(s);
        }}
        onDragEnd={onDragEnd}
        modifiers={[restrictToParentElement, restrictToWindowEdges]}
      >
        <div
          className="relative rounded-2xl bg-white shadow p-4 border border-slate-200"
        >
          <Grid seating={seating} getStudentAtSeat={getStudentAtSeat} />
        </div>

        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeStudent ? <StudentCard student={activeStudent} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <UnseatedList
        students={students}
        seating={seating}
        onPlace={(studentId, toSeat) => {
          // Find current seat (if any), then move
          const currentSeat = Object.keys(seating).find(k => seating[k] === studentId);
          if (!currentSeat) {
            setSeating(prev => {
              const next = { ...prev };
              next[toSeat] = studentId;
              storage.set(STORAGE_KEY, next);
              return next;
            });
          } else if (currentSeat !== toSeat) {
            moveToEmpty(currentSeat, toSeat, studentId);
          }
        }}
        />
    </div>
  );
}

/* ---------- Presentational + DnD pieces ---------- */

import { useDraggable, useDroppable } from "@dnd-kit/core";

function Grid({ seating, getStudentAtSeat }: {
  seating: SeatingMap;
  getStudentAtSeat: (seatId: string) => Student | null;
}) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`
      }}
    >
      {seatIds().map(id => (
        <Seat key={id} id={id}>
          {(() => {
            const s = getStudentAtSeat(id);
            return s ? <DraggableStudent seatId={id} student={s} /> : <EmptySeatBadge />;
          })()}
        </Seat>
      ))}
    </div>
  );
}

function Seat({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`h-28 rounded-xl border flex items-center justify-center transition
        ${isOver ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-300"}
        bg-slate-50`}
      aria-label={`Seat ${id}`}
    >
      {children}
    </div>
  );
}

function EmptySeatBadge() {
  return (
    <div className="text-slate-400 text-sm select-none">Empty</div>
  );
}

function DraggableStudent({ student, seatId }: { student: Student; seatId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student:${student.id}`,
    data: { studentId: student.id, seatId, student },
  });

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StudentCard student={student} dragging={isDragging} />
    </div>
  );
}

function StudentCard({ student, dragging }: { student: Student; dragging?: boolean }) {
  return (
    <div
      className={`w-[150px] h-[72px] rounded-xl border bg-white shadow-sm px-3 py-2 flex items-center gap-3
        ${dragging ? "opacity-90 scale-[1.02]" : "hover:shadow"} transition`}
      >
      {student.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.photo} alt={student.name} className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm">{initials(student.name)}</div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{student.name}</div>
        <div className="text-xs text-slate-500">Drag to move</div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
}

/** Optional: a panel that shows anyone not currently seated and lets you click-place them into an empty seat */
function UnseatedList({
  students,
  seating,
  onPlace,
}: {
  students: Student[];
  seating: SeatingMap;
  onPlace: (studentId: string, toSeat: string) => void;
}) {
  const seated = new Set(Object.values(seating).filter(Boolean) as string[]);
  const unseated = students.filter(s => !seated.has(s.id));

  if (unseated.length === 0) return null;

  const firstEmpty = Object.keys(seating).find(k => seating[k] === null) ?? null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Unseated</h3>
      <div className="flex flex-wrap gap-3">
        {unseated.map(s => (
          <button
            key={s.id}
            onClick={() => {
              if (!firstEmpty) return;
              onPlace(s.id, firstEmpty);
            }}
            className="rounded-xl border bg-white hover:bg-slate-50 px-3 py-2 flex items-center gap-2 text-left shadow-sm"
            title="Click to place in first available seat"
          >
            <span className="inline-flex w-7 h-7 rounded-full bg-slate-200 items-center justify-center text-xs text-slate-600">
              {initials(s.name)}
            </span>
            <span className="text-sm">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
