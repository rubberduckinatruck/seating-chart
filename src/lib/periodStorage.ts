// src/lib/periodStorage.ts
import { storage } from '../lib/storage'
import type { TemplateConfig } from '../lib/types'
import { normalizeTemplateFixtures } from './fixtures'

// Adjust this list if your periods differ:
export const PERIOD_KEYS = ['p1', 'p3', 'p4', 'p5', 'p6'] as const
export type PeriodKey = typeof PERIOD_KEYS[number]

const LS_KEYS = {
  sc: (k: PeriodKey) => `sc.period.${k}`,
  seating: (k: PeriodKey) => `seating.period.${k}`, // legacy compat
}

/** Read a per-period template config (falls back to global template if none saved). */
export async function readPeriodConfig(k: PeriodKey): Promise<TemplateConfig> {
  // Try sc.* first, then seating.*
  const raw =
    localStorage.getItem(LS_KEYS.sc(k)) ??
    localStorage.getItem(LS_KEYS.seating(k))

  if (raw) {
    try {
      const tpl = JSON.parse(raw) as TemplateConfig
      // Normalize fixtures (adds w/h, coerces legacy types like 'tb' → 'tb-desk')
      const norm = normalizeTemplateFixtures(tpl)
      if (norm.changed) {
        // persist normalized back to both keys for consistency
        localStorage.setItem(LS_KEYS.sc(k), JSON.stringify(norm.template))
        localStorage.setItem(LS_KEYS.seating(k), JSON.stringify(norm.template))
        try { localStorage.setItem('sc.bump.fixtures', String(Date.now())) } catch {}
        try { localStorage.setItem('seating.bump.fixtures', String(Date.now())) } catch {}
      }
      return norm.template
    } catch {
      // fall through to global template if parse fails
    }
  }

  // Fallback: use the current global template
  const globalTpl = storage.getTemplate() as TemplateConfig
  const norm = normalizeTemplateFixtures(globalTpl)
  if (norm.changed) {
    // Don’t write global into a period slot unless the caller explicitly saves.
    // Just return normalized for rendering.
    return norm.template
  }
  return globalTpl
}

/** Write a per-period template config (saves under both sc.* and seating.* keys). */
export async function writePeriodConfig(k: PeriodKey, cfg: TemplateConfig): Promise<void> {
  const norm = normalizeTemplateFixtures(cfg)
  const toSave = JSON.stringify(norm.template)
  localStorage.setItem(LS_KEYS.sc(k), toSave)
  localStorage.setItem(LS_KEYS.seating(k), toSave)
  // fan out to listeners
  try { localStorage.setItem('sc.bump.fixtures', String(Date.now())) } catch {}
  try { localStorage.setItem('seating.bump.fixtures', String(Date.now())) } catch {}
}
