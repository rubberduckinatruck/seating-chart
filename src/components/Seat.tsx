import { useRef, useState } from 'react'
import type { StudentTag } from '../lib/types'
import { snap } from '../lib/drag'

export default function Seat({
  id, x, y, w, h, tags, onMove, onToggleTag
}: {
  id: string
  x: number
  y: number
  w: number
  h: number
  tags: StudentTag[]
  onMove: (nx: number, ny: number) => void
  onToggleTag: (tag: StudentTag) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [tagDragOver, setTagDragOver] = useState(false)

  // ----- seat move (mouse drag) -----
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-popover]')) return
    setOpen(false)
    setDrag({ ox: e.clientX, oy: e.clientY, sx: x, sy: y })
    window.addEventListener('mousemove', onMouseMove as any)
    window.addEventListener('mouseup', onMouseUp as any, { once: true })
  }
  function onMouseMove(e: MouseEvent) {
    if (!drag) return
    const dx = e.clientX - drag.ox
    const dy = e.clientY - drag.oy
    const nx = snap(drag.sx + dx)
    const ny = snap(drag.sy + dy)
    onMove(nx, ny)
  }
  function onMouseUp() {
    setDrag(null)
    window.removeEventListener('mousemove', onMouseMove as any)
  }

  // ----- tag DnD (drag from TagPalette onto a seat) -----
  function onTagDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/tag')) {
      e.preventDefault() // allow drop
      setTagDragOver(true)
    }
  }
  function onTagDragLeave() {
    setTagDragOver(false)
  }
  function onTagDrop(e: React.DragEvent) {
    const tag = e.dataTransfer.getData('text/tag') as StudentTag
    setTagDragOver(false)
    if (tag) onToggleTag(tag)
  }

  return (
    <div
      ref={ref}
      className={[
        'absolute select-none cursor-move rounded-lg border border-slate-300 bg-white shadow-sm',
        tagDragOver ? 'ring-2 ring-blue-400/60' : ''
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h, padding: 8 }}
      onMouseDown={onMouseDown}
      onDoubleClick={() => setOpen(v => !v)}
      onDragOver={onTagDragOver}
      onDragLeave={onTagDragLeave}
      onDrop={onTagDrop}
      title="Drag tag pills here to toggle; drag seat to move; double-click for tag menu"
    >
      {/* optional visual while tag hovering */}
      {tagDragOver && (
        <div className="pointer-events-none absolute inset-1 rounded-md border-2 border-dashed border-blue-400/40" />
      )}

      <div className="text-[10px] text-slate-500 mb-1">{id}</div>
      <div className="text-[10px] text-slate-600">Desk</div>

      {open && (
        <div
          data-popover
          className="absolute z-20 mt-2 left-0 top-full bg-white border border-slate-200 rounded-md shadow p-2 text-xs"
        >
          <div className="font-medium mb-1">Desk tags</div>
          {(['front row', 'back row', 'near TB'] as StudentTag[]).map(tag => {
            const active = tags.includes(tag)
            return (
              <button
                key={tag}
                className={
                  'mr-1 mb-1 px-2 py-1 rounded border ' +
                  (active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300')
                }
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleTag(tag)
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
