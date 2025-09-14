// src/components/PeriodSeat.tsx
import React from 'react'
import { withBase } from '../lib/withBase'

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
  onUnassign?: () => void          // kept for compatibility; not rendered
  onDropStudent: (studentId: string) => void
  onDragStudentStart: () => void
}

export default function PeriodSeat(props: Props) {
  const {
    periodId, seatId, x, y, w, h, tags = [],
    isExcluded, isSelected, studentId, studentName,
    onClick, onToggleExclude, onDropStudent,
  } = props

  const isBackRow = Array.isArray(tags) && tags.includes('back row')

  // Click behavior:
  // - Back row: clicking toggles exclude (multi-select friendly: no selection state)
  // - Other rows: keep existing select/swap behavior
  function handleClick() {
    if (isBackRow) onToggleExclude()
    else onClick()
  }

  // DnD (move student onto seat)
  function handleDragOver(e: React.DragEvent) { e.preventDefault() }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const sid = e.dataTransfer.getData('text/student-id') || e.dataTransfer.getData('text/plain')
    if (sid) onDropStudent(sid)
  }

  // Student image (id is the filename)
  const imgSrc = studentId ? withBase(`photos/${periodId}/${studentId}`) : null

  return (
    <div
      data-seat={seatId}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={[
        'absolute rounded-lg border bg-white cursor-pointer select-none transition',
        // Only show the select outline on NON-back-row seats
        (!isBackRow && isSelected) ? 'ring-2 ring-blue-500 shadow' : 'hover:shadow',
        isExcluded ? 'opacity-60' : '',
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h, padding: 8 }}
      title={isBackRow ? 'Click to exclude/include (back row)' : 'Click to select'}
    >
      {/* faint X overlay when excluded */}
      {isExcluded && (
        <div className="pointer-events-none absolute inset-1 flex items-center justify-center">
          <div className="absolute inset-2 opacity-20">
            <div className="absolute inset-0 border-2 border-slate-700/60 rotate-45" />
            <div className="absolute inset-0 border-2 border-slate-700/60 -rotate-45" />
          </div>
        </div>
      )}

      {/* Seat content */}
      {studentId ? (
        <div className="h-full w-full flex flex-col items-center justify-start">
          <div className="w-full flex-1 overflow-hidden rounded-md border bg-slate-50 relative">
            <img
              src={imgSrc!}
              alt={studentName ?? studentId}
              className="block w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              draggable={false}
            />
          </div>
          <div className="mt-1 text-sm text-center truncate w-full" title={studentName ?? studentId}>
            {studentName ?? studentId}
          </div>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
          Empty
        </div>
      )}
    </div>
  )
}
