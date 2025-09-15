// src/components/Fixture.tsx
import React, { useRef, useState } from 'react'
import { snap } from '../lib/drag'

type Props = {
  id: string
  type: string // 'window' | 'door' | 'tb-desk'
  x: number
  y: number
  onMove: (nx: number, ny: number) => void
  onRemove: () => void
}

const TYPE_LABEL: Record<string, string> = {
  'window': 'Window',
  'door': 'Door',
  'tb-desk': "TB's Desk",
}

const TYPE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'window': { w: 20, h: 80 },
  'door': { w: 20, h: 80 },
  'tb-desk': { w: 90, h: 120 },
}

const TYPE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  'window': { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900/80' },
  'door': { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900/80' },
  'tb-desk': { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900/80' },
}


export default function Fixture({ id, type, x, y, onMove, onRemove }: Props) {
  const size = TYPE_DEFAULT_SIZE[type] ?? { w: 120, h: 60 } // fixed size from code
  const style = TYPE_STYLE[type] ?? { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900/80' }
  const label = TYPE_LABEL[type] ?? (type?.toString?.() || 'Fixture')

  const dragRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null)
  const rafId = useRef<number | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-fixture-controls]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, sx: x, sy: y }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const { px, py, sx, sy } = dragRef.current
    const nx = snap(sx + (e.clientX - px))
    const ny = snap(sy + (e.clientY - py))
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => onMove(nx, ny))
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }





  
  return (
    <div
      className={[
        'absolute select-none cursor-move rounded-md border shadow-sm',
        style.bg, style.border,
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={onContainerPointerDown}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      title={`${label} (${id}) — drag to move`}
    >
      {/* Remove button (top-right) */}
      <div
        data-fixture-controls
        className="absolute right-0 top-0 p-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="px-1 rounded text-[10px] opacity-70 hover:opacity-100 bg-white/70"
          onClick={(e) => { e.stopPropagation(); props.onRemove() }}
          title="Remove fixture"
        >
          ✕
        </button>
      </div>

      {/* Centered label */}
      <div className={`absolute inset-0 flex items-center justify-center ${style.text} text-[12px] font-medium`}>
        {label}
      </div>
  )
}
