
import { useState } from 'react'
import type { FixtureType } from '../lib/types'
import { snap } from '../lib/drag'

function label(type: FixtureType) {
  if (type === 'tb') return "TB's desk"
  if (type === 'door') return 'Door'
  return 'Window'
}

export default function Fixture({ id, type, x, y, onMove, onRemove }:
  { id: string; type: FixtureType; x: number; y: number; onMove: (nx:number, ny:number) => void; onRemove: () => void }) {
  const [drag, setDrag] = useState<{ ox:number; oy:number; sx:number; sy:number } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    setDrag({ ox: e.clientX, oy: e.clientY, sx: x, sy: y })
    window.addEventListener('mousemove', onMouseMove as any)
    window.addEventListener('mouseup', onMouseUp as any, { once: true })
  }
  function onMouseMove(e: MouseEvent) {
    if (!drag) return
    const dx = e.clientX - drag.ox
    const dy = e.clientY - drag.oy
    onMove(snap(drag.sx + dx), snap(drag.sy + dy))
  }
  function onMouseUp() { setDrag(null); window.removeEventListener('mousemove', onMouseMove as any) }

  return (
    <div
      className="absolute rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-xs px-2 py-1 select-none cursor-move"
      style={{ left: x, top: y }}
      onMouseDown={onMouseDown}
      title={label(type)}
    >
      {label(type)}
      <button className="ml-2 text-[10px] text-sky-700 underline" onClick={(e) => { e.stopPropagation(); onRemove() }}>remove</button>
    </div>
  )
}
