import { useEffect, useRef, useState } from 'react'
import type { TemplateConfig } from '../lib/types'

const PRESET_KEYS = ['template-default', 'testing', 'groups'] as const
type PresetKey = typeof PRESET_KEYS[number]

const PRESET_LABELS: Record<PresetKey, string> = {
  'template-default': 'Default Layout',
  'testing': 'Testing (Rows/Spacing)',
  'groups': 'Groups (Pods)',
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

  // ---- Fixture picker (kept) ----
  type FixtureType = TemplateConfig['fixtures'][number]['type']
  const FIXTURE_TYPES: FixtureType[] = [
    'teacher-desk',
    'door',
    'window',
    'whiteboard',
  ] as unknown as FixtureType[]
  const [fixtureType, setFixtureType] = useState<FixtureType>(FIXTURE_TYPES[0])

  // Seed default preset once if missing
  useEffect(() => {
    if (!lsGetPreset('template-default')) {
      lsSetPreset('template-default', cfg)
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
      onChange(json as TemplateConfig)
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      e.target.value = ''
    }
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
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
    onChange(saved)
  }

  function savePreset() {
    const ok =
      preset === 'template-default'
        ? confirm('Overwrite "Default Layout" with the current layout?')
        : true
    if (!ok) return
    lsSetPreset(preset, cfg)
  }

  // ----- Fixtures (keep Add, remove count) -----
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
    // Spawn near top-left with a slight offset
    const offset = cfg.fixtures.length * 8
    const fx = { id, type: kind, x: 12 + offset, y: 48 + offset } as TemplateConfig['fixtures'][number]
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

      {/* Fixtures: type picker + add (no count) */}
      <div className="flex items-center gap-2">
        <select
          value={String(fixtureType)}
          onChange={(e) => setFixtureType(e.target.value as unknown as FixtureType)}
          className="text-sm rounded-md border border-slate-300 bg-white px-2 py-1"
          title="Fixture type to add"
        >
          {FIXTURE_TYPES.map((t) => (
            <option key={String(t)} value={String(t)}>
              {String(t)}
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
