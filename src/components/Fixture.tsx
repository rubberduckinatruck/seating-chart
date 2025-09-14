// src/components/Fixture.tsx
import React, { useRef, useState } from 'react'
import { snap } from '../lib/drag'

type Props = {
  id: string
  type: string // 'window' | 'door' | 'tb-desk' | etc.
  x: number
  y: number
  w?: number
  h?: number
  onMove: (nx: number, ny: number) => void
  onResize?: (nw: number, nh: number) => void
  onRemove: () => void
}

const TYPE_LABEL: Record<string, string> = {
  'window': 'Window',
  'door': 'Door',
  'tb-desk': "TB's Desk",
}

const TYPE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'window': { w: 10, h: 40 },
  'door': { w: 10, h: 40 },
  'tb-desk': { w: 90, h: 120 },
}

const TYPE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  'window': { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900/80' },
  'door': { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900/80' },
  'tb-desk': { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900/80' },
}

const MIN_W = 28
const MIN_H = 20

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export default function Fixture(props: Props) {
  const { id, type } = props
  const defaults = TYPE_DEFAULT_SIZE[type] || { w: 120, h: 60 }
  const w = Math.max(MIN_W, props.w ?? defaults.w)
  const h = Math.max(MIN_H, props.h ?? defaults.h)
  const x = props.x
  const y = props.y

  const style = TYPE_STYLE[type] || { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900/80' }
  const label = TYPE_LABEL[type] ?? (type?.toString?.() || 'Fixture')

  // drag
  const dragRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null)
  // resize
  const resRef = useRef<{ px: number; py: number; sx: number; sy: number; sw: number; sh: number; dir: Dir } | null>(null)
  // rAF batching to avoid jank
  const rafMove = useRef<number | null>(null)
  const rafResize = useRef<number | null>(null)

  function onContainerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // ignore if pressed on a handle or controls
    if ((e.target as HTMLElement).closest('[data-fixture-handle]')) return
    if ((e.target as HTMLElement).closest('[data-fixture-controls]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, sx: x, sy: y }
  }

  function onContainerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const { px, py, sx, sy } = dragRef.current
    const nx = snap(sx + (e.clientX - px))
    const ny = snap(sy + (e.clientY - py))
    if (rafMove.current) cancelAnimationFrame(rafMove.current)
    rafMove.current = requestAnimationFrame(() => props.onMove(nx, ny))
  }

  function onContainerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      dragRef.current = null
      if (rafMove.current) {
        cancelAnimationFrame(rafMove.current)
        rafMove.current = null
      }
    }
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>, dir: Dir) {
    e.stopPropagation()
    ;(e.currentTarget.parentElement as HTMLElement)?.setPointerCapture(e.pointerId)
    resRef.current = { px: e.clientX, py: e.clientY, sx: x, sy: y, sw: w, sh: h, dir }
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resRef.current) return
    const { px, py, sx, sy, sw, sh, dir } = resRef.current
    let nx = sx
    let ny = sy
    let nw = sw
    let nh = sh
    const dx = e.clientX - px
    const dy = e.clientY - py

    // horizontal edges
    if (dir.includes('e')) nw = sw + dx
    if (dir.includes('w')) { nw = sw - dx; nx = sx + dx }
    // vertical edges
    if (dir.includes('s')) nh = sh + dy
    if (dir.includes('n')) { nh = sh - dy; ny = sy + dy }

    // enforce minimums, adjust pos for W/N clamps
    if (nw < MIN_W) { nx = sx + (sw - MIN_W); nw = MIN_W }
    if (nh < MIN_H) { ny = sy + (sh - MIN_H); nh = MIN_H }

    // snap all
    nx = snap(nx)
    ny = snap(ny)
    nw = Math.max(MIN_W, snap(nw))
    nh = Math.max(MIN_H, snap(nh))

    if (rafMove.current) cancelAnimationFrame(rafMove.current)
    if (rafResize.current) cancelAnimationFrame(rafResize.current)

    // position & size can change during a single resize gesture
    rafMove.current = requestAnimationFrame(() => props.onMove(nx, ny))
    rafResize.current = requestAnimationFrame(() => props.onResize?.(nw, nh))
  }

  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (resRef.current) {
      resRef.current = null
      if (rafMove.current) { cancelAnimationFrame(rafMove.current); rafMove.current = null }
      if (rafResize.current) { cancelAnimationFrame(rafResize.current); rafResize.current = null }
    }
    ;(e.currentTarget.parentElement as HTMLElement)?.releasePointerCapture?.(e.pointerId)
  }

  // shared classes for handles
  const handleBase =
    'absolute w-2.5 h-2.5 bg-slate-700/70 rounded-sm ring-2 ring-white shadow pointer-events-auto'
  const handle = (pos: string, cursor: string) =>
    `${handleBase} ${pos} ${cursor}`

  return (
    <div
      className={[
        'absolute select-none cursor-move rounded-md border shadow-sm',
        style.bg, style.border,
        // subtle focus ring while active
        (dragRef.current || resRef.current) ? 'ring-2 ring-blue-500/50' : ''
      ].join(' ')}
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={onContainerPointerDown}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      title={`${label} (${id}) — drag to move, resize from any edge/corner`}
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

      {/* 8 resize handles */}
      <div
        data-fixture-handle
        className={handle('left-1/2 -translate-x-1/2 top-0', 'cursor-n-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'n')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('left-1/2 -translate-x-1/2 bottom-0', 'cursor-s-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 's')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('top-1/2 -translate-y-1/2 right-0', 'cursor-e-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'e')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('top-1/2 -translate-y-1/2 left-0', 'cursor-w-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'w')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />

      <div
        data-fixture-handle
        className={handle('left-0 top-0', 'cursor-nw-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'nw')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('right-0 top-0', 'cursor-ne-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'ne')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('right-0 bottom-0', 'cursor-se-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'se')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
      <div
        data-fixture-handle
        className={handle('left-0 bottom-0', 'cursor-sw-resize')}
        onPointerDown={(e) => onHandlePointerDown(e, 'sw')}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
    </div>
  )
}
