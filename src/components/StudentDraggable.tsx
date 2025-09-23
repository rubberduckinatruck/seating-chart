// src/components/StudentDraggable.tsx
import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { withBase } from '../lib/withBase'

export default function StudentDraggable({
  periodId,
  seatId,
  studentId,
  studentName,
}: {
  periodId: string
  seatId: string
  studentId: string
  studentName: string | null
}) {
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: studentId,
    data: { type: 'student', studentId, originSeatId: seatId, periodId }
  })

  const imgSrc = withBase(`photos/${periodId}/${studentId}`)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={[
        'h-full w-full flex flex-col items-center justify-start',
        isDragging ? 'opacity-60' : ''
      ].join(' ')}
      aria-grabbed={isDragging}
    >
      <div className="w-full flex-1 overflow-hidden rounded-md border bg-slate-50 relative cursor-grab active:cursor-grabbing">
        <img
          src={imgSrc}
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
  )
}
