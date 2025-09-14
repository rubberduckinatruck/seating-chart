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
  onClick: () => void              // existing: select/swap
  onToggleExclude: () => void      // existing: toggle exclude
  onUnassign?: () => void          // kept for compatibility, not rendered
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

  // Clicking behavior:
  // - Back row: click toggles exclude (per your request)
  // - Other rows: click keeps existing select/swap behavior
  function handleClick() {
    if (isBackRow) onToggleExclude()
    else onClick()
  }

  // Drop a student onto this seat
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const sid = e.dataTransfer.getData('text/student-id') || e.dataTransfer.getData('text/plain')
    if (sid) onDropStudent(sid)
  }

  // Build image URL for the student photo when assigned
  const imgSrc = studentId ? withBase(`photos/${periodId}/${studentId}`) : null

  return (
    <div
      data-seat={seatId}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={[
        'absolute rounded-lg border shadow-sm bg-white cursor-pointer select-none transition',
        isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow',
        isExcluded ? 'opacity-40 grayscale' : '',
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h, padding: 8 }}
      title={isBackRow ? 'Click to exclude/include (back row)' : 'Click to select'}
    >
      {/* Seat content */}
      {studentId ? (
        <div className="h-full w-full flex flex-col items-center justify-start">
          {/* Photo */}
          <div className="w-full flex-1 overflow-hidden rounded-md border bg-slate-50">
            {/* If an image fails, the border+bg shows instead of a broken icon */}
            <img
              src={imgSrc!}
              alt={studentName ?? studentId}
              className="block w-full h-full object-cover"
              onError={(e) => {
                // hide broken icon; show empty framed box instead
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
              draggable={false}
            />
          </div>
          {/* Name under the photo */}
          <div className="mt-1 text-sm text-center truncate w-full" title={studentName ?? studentId}>
            {studentName ?? studentId}
          </div>
        </div>
      ) : (
        // Empty seat placeholder
        <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
          Empty
        </div>
      )}

      {/* NOTE: No Unassign or Exclude buttons rendered.
         - Exclude toggles by click on BACK ROW seats.
         - Selection/swap via click on other rows (unchanged behavior).
      */}
    </div>
  )
}
