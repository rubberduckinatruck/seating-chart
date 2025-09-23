// src/components/FixturesLayer.tsx
import React from 'react'
import type { TemplateConfig } from '../lib/types'
import { defaultFixtureSize } from '../lib/fixtures'

type Props = {
  fixtures: TemplateConfig['fixtures'] | undefined
  left: number
  width: number
  height: number
  /** Seat size only used if a legacy fixture is missing w/h (rare after normalization) */
  cellW: number
  cellH: number
}

export default function FixturesLayer({ fixtures, left, width, height, cellW, cellH }: Props) {
  const items = Array.isArray(fixtures) ? (fixtures as any[]) : []

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{ left, width, height }}
      aria-hidden="true"
    >
      {items.map((f, idx) => {
        const type = String((f as any).type ?? 'fixture')
        const x = toNum((f as any).x, 0)
        const y = toNum((f as any).y, 0)

        // Prefer explicit w/h; fall back to defaults only if missing
        const dflt = defaultFixtureSize(type, cellW, cellH)
        const w = toNum((f as any).w, dflt.w)
        const h = toNum((f as any).h, dflt.h)

        const label = String((f as any).label ?? prettyType(type))
        const key = String((f as any).id ?? `${type}-${x}-${y}-${w}-${h}-${idx}`)
        const cls = styleFor(type)

        // Label rotation: explicit beats auto
        const angle = getLabelAngle(f as any, w, h)

        // Font size adapts a bit to shorter edge to avoid overflow
        const fontSize = clamp(Math.floor(Math.min(w, h) * 0.22), 9, 14)

        return (
          <div
            key={key}
            className={`absolute rounded-sm border ${cls}`}
            style={{ left: x, top: y, width: w, height: h, opacity: 0.9 }}
          >
            <div className="absolute inset-0 flex items-center justify-center select-none">
              <div
                // center then rotate the text
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  fontSize,
                  color: '#1f2937', // slate-800
                  pointerEvents: 'none',
                }}
              >
                {label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function toNum(v: unknown, fb: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
function prettyType(t: string) {
  return t.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

type FixtureLike = {
  labelAngle?: number
  labelDir?: 'auto' | 'up' | 'down' | 'left' | 'right'
  type?: string
}

/**
 * Choose the label angle:
 * 1) If fixture has `labelAngle` (degrees), use it.
 * 2) Else if fixture has `labelDir`, map to an angle.
 * 3) Else auto: vertical (tall & skinny) gets -90°, horizontal is 0°.
 */
function getLabelAngle(f: FixtureLike, w: number, h: number): number {
  if (Number.isFinite(f?.labelAngle as number)) {
    return Number(f!.labelAngle)
  }
  switch (f?.labelDir) {
    case 'up': return -90
    case 'down': return 90
    case 'left': return 180
    case 'right': return 0
    case 'auto':
    default:
      return h >= w * 1.3 ? -90 : 0
  }
}

/** Tailwind-ish color hints by type; defaults are neutral. */
function styleFor(type: string) {
  switch (type) {
    case 'door':
      return 'bg-amber-200 border-amber-500'
    case 'window':
    case 'window-h':
      return 'bg-sky-200 border-sky-500'
    case 'board':
    case 'whiteboard':
    case 'chalkboard':
      return 'bg-emerald-200 border-emerald-500'
    case 'teacher':
    case 'teacherDesk':
    case 'teacher_desk':
    case 'tb-desk':
      return 'bg-violet-200 border-violet-500'
    default:
      return 'bg-slate-200 border-slate-400'
  }
}
