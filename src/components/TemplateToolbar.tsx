import { useEffect, useRef, useState } from 'react'
import type { TemplateConfig } from '../lib/types'
import { storage } from '../lib/storage'

const PRESET_KEYS = ['template-default', 'testing', 'groups'] as const
type PresetKey = typeof PRESET_KEYS[number]

const PRESET_LABELS: Record<PresetKey, string> = {
  'template-default': 'Default Paired Columns',
  'testing': 'Testing',
  'groups': 'Groups of 4',
}

const LS_PREFIX = 'seating.presets.'

function isValidTemplate(x: any): x is TemplateConfig {
  return (
    x &&
    Array.isArray(x.desks) &&
    typeof x.spacing === 'object' &&
    typeof x.spacing.cardW === 'number' &&
    typeof x.spacing.cardH === 'number' &&
    Array.isArray(x.fixtures)
  )
}

// --- Normalization helpers ---
type CanonType = 'tb-desk' | 'door' | 'window' | 'window-h'
function normType(t: any): CanonType {
  const s = String(t).toLowerCase().trim()
  if (s === 'tb-desk' || s === "tb's desk" || s === 'teacher-desk' || s === 'tbdesk' || s === 'tb_desk') return 'tb-desk'
  if (s === 'door') return 'door'
  if (s === 'window-h' || s === 'window_horizontal' || s === 'window-horiz' || s === 'h-window') return 'window-h'
  if (s === 'window') return 'window'
  return 'window'
}

function normalizeTemplate(input: TemplateConfig): TemplateConfig {
  return {
    ...input,
    fixtures: (input.fixtures || []).map((f: any) => {
      const { w, h, type, ...rest } = f ?? {}
      // remove w/h entirely, clamp type, keep id/x/y/anything else relevant
      return { ...rest, type: normType(type) }
    }),
  }
}

function lsGetPreset(key: PresetKey): TemplateConfig | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (!raw) return null
    const json = JSON.parse(raw)
    return isValidTemplate(json) ? (json as TemplateConfig) : null
  } catch {
    return null
  }
}

function lsSetPreset(key: PresetKey, cfg: TemplateConfig) {
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(cfg))
}

export default function TemplateToolbar({
  cfg,
  onChange,
}: {
  cfg: TemplateConfig
  onChange: (next: TemplateConfig) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preset, setPreset] = useState<PresetKey>('template-default')

  // Must match Fixture.tsx types exactly:
  type FixtureType = CanonType
  const FIXTURE_TYPES: FixtureType[] = ['tb-desk', 'door', 'window', 'window-h']
  const [fixtureType, setFixtureType] = useState<FixtureType>(FIXTURE_TYPES[0])

  // Seed default preset once if missing (normalized)
  useEffect(() => {
    if (!lsGetPreset('template-default')) {
      lsSetPreset('template-default', normalizeTemplate(cfg))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- Import / Export -----
  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (!isValidTemplate(json)) throw new Error('Invalid template JSON')
      onChange(normalizeTemplate(json))
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      e.target.value = ''
    }
  }

  function onExport() {
    // Export a normalized view so no w/h ever leave the app
    const blob = new Blob([JSON.stringify(normalizeTemplate(cfg), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ----- Presets -----
  function loadPreset() {
    const saved = lsGetPreset(preset)
    if (!saved) {
      alert(`No data saved for preset "${PRESET_LABELS[preset]}". Use Save to store the current layout.`)
      return
    }
    onChange(normalizeTemplate(saved))
  }

  function savePreset() {
    const ok =
      preset === 'template-default'
        ? confirm('Overwrite "Default Paired Columns" with the current layout?')
        : true
    if (!ok) return
    lsSetPreset(preset, normalizeTemplate(cfg))
  }

  // ----- Apply fixtures to all periods (robust: detects storage key variant + broadcasts UI update) -----
  const PERIOD_KEYS = ['p1', 'p3', 'p4', 'p5', 'p6'] as const

  function keyVariants(k: string) {
    // support multiple storage schemas just in case
    return [`period.${k}`, `seating.period.${k}`]
  }

  async function readExistingPeriodCfg(k: string) {
    for (const key of keyVariants(k)) {
      try {
        const val = await storage.get<TemplateConfig>(key)
        if (val) return { key, cfg: val }
      } catch {
        // ignore and continue
      }
    }
    return null
  }

  async function writePeriodCfg(bestKey: string, nextCfg: TemplateConfig) {
    await storage.set(bestKey, nextCfg)
  }

  async function copyFixturesToAllPeriods() {
    const base = lsGetPreset('template-default')
    if (!base) {
      alert('No "Default Paired Columns" preset found. Open Template tab and Save it first.')
      return
    }
    const fx = normalizeTemplate(base).fixtures

    const ok = confirm(`This will REPLACE fixtures in ${PERIOD_KEYS.length} periods with the preset’s fixtures. Continue?`)
    if (!ok) return

    let updated = 0
    for (const k of PERIOD_KEYS) {
      try {
        const found = await readExistingPeriodCfg(k)
        if (!found) continue
        const next = { ...found.cfg, fixtures: fx }
        await writePeriodCfg(found.key, next)
        updated += 1
      } catch (e) {
        console.warn('Failed updating period', k, e)
      }
    }

    try {
      // Let any open Period canvases refresh immediately
      window.dispatchEvent(new CustomEvent('seating:fixtures-updated', { detail: { fixtures: fx } }))
    } catch {
      // ignore if CustomEvent not available
    }

    alert(`Done. Fixtures copied to ${updated}/${PERIOD_KEYS.length} periods.`)
  }

  // ----- Fixtures (Add only; no sizes here) -----
  function pickUniqueId(base: string) {
    const used = new Set(cfg.fixtures.map(f => f.id))
    let n = 1
    let id = `${base}-${n}`
    while (used.has(id)) {
      n += 1
      id = `${base}-${n}`
    }
    return id
  }

  function addFixture(kind: FixtureType) {
    const base = String(kind).replace(/\s+/g, '-')
    const id = pickUniqueId(base)
    const offset = cfg.fixtures.length * 8

    // IMPORTANT: do not set w/h. Fixture.tsx enforces fixed sizes.
    const fx = {
      id,
      type: kind,
      x: 12 + offset,
      y: 48 + offset,
    } as TemplateConfig['fixtures'][number]

    onChange({ ...cfg, fixtures: [...cfg.fixtures, fx] })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Presets */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">Presets:</label>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as PresetKey)}
          className="text-sm rounded-md border border-slate-300 bg-white px-2 py-1"
          title="Choose a preset slot"
        >
          {PRESET_KEYS.map((k) => (
            <option key={k} value={k}>
              {PRESET_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          onClick={loadPreset}
          title="Load the selected preset"
        >
          Load
        </button>
        <button
          type="button"
          className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          onClick={savePreset}
          title="Save/Update selected preset with current layout"
        >
          Save
        </button>
      </div>

      {/* Divider */}
      <div className="mx-2 h-5 w-px bg-slate-200" />

      {/* Fixtures: type picker + add */}
      <div className="flex items-center gap-2">
        <select
          value={fixtureType}
          onChange={(e) => setFixtureType(e.target.value as FixtureType)}
          className="text-sm rounded-md border border-slate-300 bg-white px-2 py-1"
          title="Fixture type to add"
        >
          {FIXTURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          onClick={() => addFixture(fixtureType)}
          title="Add a fixture of the selected type"
        >
          + Add
        </button>
      </div>

      <button
        type="button"
        className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
        onClick={copyFixturesToAllPeriods}
        title="Overwrite fixtures on every period with the current preset’s fixtures"
      >
        Apply fixtures
      </button>

      {/* Divider */}
      <div className="mx-2 h-5 w-px bg-slate-200" />

      {/* Import / Export */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onImport}
      />
      <button
        type="button"
        className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
        onClick={() => fileRef.current?.click()}
        title="Import a template JSON file"
      >
        Import Template JSON
      </button>

      <button
        type="button"
        className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
        onClick={onExport}
        title="Download the current template as JSON"
      >
        Export Template JSON
      </button>
    </div>
  )
}
