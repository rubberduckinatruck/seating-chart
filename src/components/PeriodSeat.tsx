
import React from 'react'
import type { StudentTag } from '../lib/types'
import LazyImage from './LazyImage'

export default function PeriodSeat({
  periodId,
  seatId,
  x,
  y,
  w,
  h,
  tags,
  isExcluded,
  isSelected,
  studentId,
  studentName,
  onClick,
  onToggleExclude,
  onUnassign,
  onDropStudent,
  onDragStudentStart,
}: {
  periodId: string
  seatId: string
  x: number
  y: number
  w: number
  h: number
  tags: StudentTag[]
  isExcluded: boolean
  isSelected: boolean
  studentId: string | null
  studentName: string | null
  onClick: () => void
  onToggleExclude: () => void
  onUnassign: () => void
  onDropStudent: (studentId: string) => void
  onDragStudentStart: (studentId: string) => void
}) {
  const base =
    'absolute rounded-lg border p-2 text-xs transition-colors ' +
    (isExcluded ? 'bg-slate-200 border-slate-300 text-slate-500' : 'bg-white border-slate-300')

  const selected = isSelected ? ' ring-2 ring-blue-500' : ''

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function onDrop(e: React.DragEvent) {
    const id = e.dataTransfer.getData('text/plain')
    if (id) onDropStudent(id)
  }

  const photoUrl = studentId ? `/photos/${periodId}/${studentId}` : null

  return (
    <div
      className={base + selected}
      style={{ left: x, top: y, width: w, height: h }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span>{seatId}</span>
        {isExcluded && (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="inline-block w-3 h-3 rounded-full bg-slate-400"></span> excluded
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        {photoUrl ? (
          <LazyImage
            src={photoUrl}
            alt={studentName || ''}
            className="w-[48px] h-[58px] object-cover rounded border border-slate-200"
            width={48}
            height={58}
          />
        ) : (
          <div className="w-[48px] h-[58px] rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">no photo</div>
        )}

        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            draggable={!!studentId}
            onDragStart={(e) => {
              if (!studentId) return
              e.dataTransfer.setData('text/plain', studentId)
              onDragStudentStart(studentId)
            }}
            title={studentName || ''}
          >
            {studentName || '(empty)'}
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            {(tags ?? []).map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white hover:bg-slate-50"
          onClick={(e) => { e.stopPropagation(); onToggleExclude() }}
        >
          {isExcluded ? 'Include seat' : 'Exclude seat'}
        </button>
        {studentId && (
          <button
            className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white hover:bg-slate-50"
            onClick={(e) => { e.stopPropagation(); onUnassign() }}
          >
            Unassign
          </button>
        )}
      </div>
    </div>
  )
}
