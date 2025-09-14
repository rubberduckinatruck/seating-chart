// src/components/Fixture.tsx
import React, { useRef, useState } from 'react'
import { snap } from '../lib/drag'

type Props = {
  id: string
  type: string
  x: number
  y: number
  w?: number
  h?: number
  onMove: (nx: number, ny: number) => void
  onResize?: (nw: number, nh: number) => void
  onRemove: () => void
}

const TYPE_LABEL: Record<string, string> = {
  'teacher-desk': 'Teacher Desk',
  'door': 'Door',
  'window': 'Window',
  'whiteboard': 'Whiteboard',
}

const TYPE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'teacher-desk': { w: 140, h: 90 },
  'door': { w: 40, h: 10 },
  'window': { w: 80, h: 10 },
  'whiteboard': { w: 220, h: 24 },
}

export default function Fixture(props: Props) {
  const { id, type, x, y, onMove, onResize, onRemove } = props
  const defaults = TYPE_DEFAULT_SIZE[type] || { w: 120, h: 60 }
  const w = Math.max(20, props.w ?? defaults.w)
  const h = Math.max(10, props.h ?? defaults.h)

  const [drag, setDrag] = useState<{ ox: number; oy: number; sx: number; sy: number } | null>(null)
  const [resz, setResz] = useState<{ ox: number; oy: number; sw: number; sh: number } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    // ignore clicks on controls/resize handle
    if ((e.target as HTMLElement).closest('[data-fixture-controls]')) return
    if ((e.target as HTMLElement).closest('[data-resize]')) return
    setDrag({ ox: e.clientX, oy: e.clientY, sx: x, sy: y })
    window.addEventListener('mousemove', onMouseMove as any)
    window.addEventListener('mouseup', onMouseUp as any, { once: true })
  }
  function onMouseMove(e: MouseEvent) {
    if (!drag) return
    const nx = snap(drag.sx + (e.clientX - drag.ox))
    const ny = snap(drag.sy + (e.clientY - drag.oy))
    onMove(nx, ny)
  }
  function onMouseUp() {
    setDrag(null)
    window.removeEventListener('mousemove', onMouseMove as any)
  }

  // resize (bottom-right corner)
  function onResizeDown(e: React.MouseEvent) {
    e.stopPropagation()
    setResz({ ox: e.clientX, oy: e.clientY, sw: w, sh: h })
    window.addEventListener('mousemove', onResizeMove as any)
    window.addEventListener('mouseup', onResizeUp as any, { once: true })
  }
  function onResizeMove(e: MouseEvent) {
    if (!resz) return
    const dw = e.clientX - resz.ox
    const dh = e.clientY - resz.oy
    const nw = Math.max(24, snap(resz.sw + dw))
    const nh = Math.max(16, snap(resz.sh + dh))
    onResize?.(nw, nh)
  }
  function onResizeUp() {
    setResz(null)
    window.removeEventListener('mousemove', onResizeMove as any)
  }

  const label = TYPE_LABEL[type] ?? (type?.toString?.() || 'Fixture')

  return (
    <div
      className={[
        'absolute rounded-md border border-slate-400/70 bg-white/80 shadow-sm',
        (drag || resz) ? 'ring-2 ring-blue-500/60' : ''
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h }}
      onMouseDown={onMouseDown}
      title={`${label} (${id}) • drag to move, grab corner to resize`}
    >
      {/* header / controls */}
      <div
        data-fixture-controls
        className="flex items-center justify-between text-[11px] leading-none px-2 py-1 bg-slate-800 text-white rounded-t-md select-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="truncate">{label}</span>
        <button
          className="ml-2 opacity-80 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove fixture"
        >
          ✕
        </button>
      </div>

      {/* resize handle */}
      <div
        data-resize
        className="absolute right-0 bottom-0 w-3 h-3 bg-slate-700 cursor-nwse-resize rounded-tr-[2px]"
        onMouseDown={onResizeDown}
        title="Resize"
      />
    </div>
  )
}
