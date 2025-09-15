import { storage } from '../lib/storage'
import type { TemplateConfig } from '../lib/types'

// Adjust this list if your periods differ:
export const PERIOD_KEYS = ['p1', 'p3', 'p4', 'p5', 'p6'] as const
export type PeriodKey = typeof PERIOD_KEYS[number]

export async function readPeriodConfig(k: PeriodKey) {
  return await storage.get<TemplateConfig>(`period.${k}`)
}

export async function writePeriodConfig(k: PeriodKey, cfg: TemplateConfig) {
  return await storage.set(`period.${k}`, cfg)
}
