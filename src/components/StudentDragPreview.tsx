// src/components/StudentDragPreview.tsx
import React from 'react'
import { withBase } from '../lib/withBase'

export default function StudentDragPreview({
  periodId,
  studentId,
  studentName,
}: {
  periodId: string
  studentId: string
  studentName: string | null
}) {
  const imgSrc = withBase(`photos/${periodId}/${studentId}`)
  return (
    <div className="w-28 select-none rounded-md border bg-white shadow p-1">
      <div className="w-full aspect-square overflow-hidden rounded">
        <img src={imgSrc} alt={studentName ?? studentId} className="w-full h-full object-cover" draggable={false} />
      </div>
      <div className="mt-1 text-xs text-center truncate">{studentName ?? studentId}</div>
    </div>
  )
}
