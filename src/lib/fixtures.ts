// src/lib/fixtures.ts
import type { TemplateConfig, TemplateFixture } from './types'

const round = (n: number) => Math.max(6, Math.round(n))

/** Sensible default sizes, scaled by seat size, used only if a fixture lacks w/h. */
export function defaultFixtureSize(type: string, cellW: number, cellH: number) {
  switch (type) {
    case 'door':       return { w: round(cellW * 0.13), h: round(cellH * 1.00) } // ~16 x 156
    case 'window':     return { w: round(cellW * 0.08), h: round(cellH * 1.00) } // ~10 x 156
    case 'window-h':   return { w: round(cellW * 1.20), h: round(cellH * 0.09) } // ~144 x 14
    case 'board':
    case 'whiteboard':
    case 'chalkboard': return { w: round(cellW * 2.5),  h: round(cellH * 0.20) } // ~300 x 31
    case 'teacher':
    case 'teacherDesk':
    case 'teacher_desk':
    case 'tb-desk':    return { w: round(cellW * 1.2),  h: round(cellH * 0.7) }  // ~144 x 109
    default:           return { w: round(cellW * 0.35), h: round(cellH * 0.35) } // generic
  }
}

/**
 * Normalize a template so every fixture has explicit type and w/h.
 * - Coerces legacy types like "tb" → "tb-desk"
 * - Fills missing w/h using meta.cellW/cellH defaults
 * Returns the normalized template and whether changes were made.
 */
export function normalizeTemplateFixtures<T extends TemplateConfig>(
  tpl: T
): { template: T; changed: boolean } {
  const meta = (tpl as any).meta || {}
  const cellW = Number.isFinite(meta.cellW) ? meta.cellW : 120
  const cellH = Number.isFinite(meta.cellH) ? meta.cellH : 156

  const src: TemplateFixture[] = Array.isArray(tpl.fixtures) ? (tpl.fixtures as any) : []
  let changed = false

  const out = src.map((f) => {
    if (!f || typeof f !== 'object') return f

    const rawType = String((f as any).type ?? 'fixture').trim().toLowerCase()
    // normalize common aliases
    const coerceType =
      rawType === 'tb' ? 'tb-desk'
      : rawType === "tb's desk" ? 'tb-desk'
      : rawType === 'teacher-desk' ? 'tb-desk'
      : rawType === 'tbdesk' ? 'tb-desk'
      : rawType === 'tb_desk' ? 'tb-desk'
      : rawType
    if (coerceType !== rawType) changed = true

    let w = Number((f as any).w)
    let h = Number((f as any).h)
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      const d = defaultFixtureSize(coerceType, cellW, cellH)
      w = Number.isFinite(w) ? w : d.w
      h = Number.isFinite(h) ? h : d.h
      changed = true
    }

    return { ...f, type: coerceType, w, h }
  })

  if (changed) {
    const next = { ...(tpl as any), fixtures: out } as T
    return { template: next, changed: true }
  }
  return { template: tpl, changed: false }
}
