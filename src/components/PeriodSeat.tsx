// src/components/PeriodSeat.tsx
import React from 'react'
import { withBase } from '../lib/withBase'
import { useDroppable } from '@dnd-kit/core'
import StudentDraggable from './StudentDraggable'

type Props = {
  periodId: string
  seatId: string
  x: number
  y: number
  w: number
  h: number
  tags?: string[]
  isExcluded: boolean
  isSelected: boolean
  studentId: string | null
  studentName: string | null
  onClick: () => void              // used for select/swap on non-back-row seats
  onToggleExclude: () => void      // toggles exclude state
}

export default function PeriodSeat(props: Props) {
  const {
    periodId, seatId, x, y, w, h, tags = [],
    isExcluded, isSelected, studentId, studentName,
    onClick, onToggleExclude,
  } = props

  const isBackRow = Array.isArray(tags) && tags.includes('back row')

  // DnD droppable
  const { isOver, setNodeRef } = useDroppable({ id: seatId, data: { type: 'seat', seatId } })
  const canAccept = !isExcluded
  const overAndValid = isOver && canAccept

  // Click behavior:
  // - Back row: clicking toggles exclude (multi-select friendly: no selection state)
  // - Other rows: keep existing select/swap behavior
  function handleClick() {
    if (isBackRow) onToggleExclude()
    else onClick()
  }

  // Student image (id is the filename)
  const imgSrc = studentId ? withBase(`photos/${periodId}/${studentId}`) : null

  return (
    <div
      ref={setNodeRef}
      data-seat={seatId}
      data-droppable-over={overAndValid ? 'true' : 'false'}
      onClick={handleClick}
      className={[
        'absolute rounded-lg border bg-white cursor-pointer select-none transition',
        // Only show the select outline on NON-back-row seats
        (!isBackRow && isSelected) ? 'ring-2 ring-blue-500 shadow' : 'hover:shadow',
        isExcluded ? 'opacity-60' : '',
        overAndValid ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h, padding: 8 }}
      title={isBackRow ? 'Click to exclude/include (back row)' : 'Click to select'}
    >
      {/* faint X overlay when excluded */}
      {isExcluded && (
        <div className="pointer-events-none absolute inset-1 flex items-center justify-center">
          <svg width="100%" height="100%">
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" />
            <line x1="100%" y1="0" x2="0" y2="100%" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" />
          </svg>
        </div>
      )}

      {/* Seat content */}
      {studentId ? (
        <StudentDraggable
          periodId={periodId}
          seatId={seatId}
          studentId={studentId}
          studentName={studentName}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
          Empty
        </div>
      )}
    </div>
  )
}
