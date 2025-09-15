import type { TemplateConfig } from '../lib/types'

export type PresetKey = 'template-default' | 'testing' | 'groups'

// === read from localStorage ===
export function lsGetPreset(key: PresetKey): TemplateConfig | null {
  try {
    const raw = localStorage.getItem('seating.presets.' + key)
    if (!raw) return null
    const json = JSON.parse(raw)
    if (!json || !Array.isArray(json.desks) || !Array.isArray(json.fixtures)) return null
    return json as TemplateConfig
  } catch {
    return null
  }
}

// === normalizer (matches Toolbar’s) ===
type CanonType = 'tb-desk' | 'door' | 'window' | 'window-h'
function normType(t: any): CanonType {
  const s = String(t).toLowerCase().trim()
  if (s === 'tb-desk' || s === "tb's desk" || s === 'teacher-desk' || s === 'tbdesk' || s === 'tb_desk') return 'tb-desk'
  if (s === 'door') return 'door'
  if (s === 'window-h' || s === 'window_horizontal' || s === 'window-horiz' || s === 'h-window') return 'window-h'
  if (s === 'window') return 'window'
  return 'window'
}

export function normalizeTemplate(input: TemplateConfig): TemplateConfig {
  return {
    ...input,
    fixtures: (input.fixtures || []).map((f: any) => {
      const { w, h, type, ...rest } = f ?? {}
      return { ...rest, type: normType(type) }
    }),
  }
}
