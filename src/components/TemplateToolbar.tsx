
import type { TemplateConfig, TemplateFixture } from '../lib/types'
import { useRef } from 'react'

export default function TemplateToolbar({ cfg, onChange }: { cfg: TemplateConfig; onChange: (next: TemplateConfig) => void }) {
  const importRef = useRef<HTMLInputElement | null>(null)

  function resetLayout() {
    const { cardW, cardH, withinPair, betweenPairs, rowGap } = cfg.spacing
    const desks = []
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const pairIndex = Math.floor(c / 2)
        const inPair = c % 2
        const x = pairIndex * (2 * cardW + withinPair + betweenPairs) + inPair * (cardW + withinPair)
        const y = r * (cardH + rowGap)
        desks.push({ id: `d${r * 6 + c + 1}`, x, y, tags: [] })
      }
    }
    onChange({ ...cfg, desks })
  }

  function clearDeskTags() {
    onChange({ ...cfg, desks: cfg.desks.map(d => ({ ...d, tags: [] })) })
  }

  function addFixture(type: 'tb' | 'door' | 'window') {
    const id = 'fx' + (1 + cfg.fixtures.length)
    onChange({ ...cfg, fixtures: [...cfg.fixtures, { id, type, x: 0, y: 0 }] })
  }

  function clearFixtures() {
    onChange({ ...cfg, fixtures: [] })
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.desks) && Array.isArray(parsed.fixtures) && parsed.spacing) {
        onChange(parsed as TemplateConfig)
      } else {
        alert('Invalid template JSON')
      }
    } catch {
      alert('Failed to import template JSON')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  function exportTemplate() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={resetLayout}>Reset layout</button>
      <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={clearDeskTags}>Clear desk tags</button>
      <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
        <button className="px-3 py-1.5 text-sm bg-white hover:bg-slate-50" onClick={() => addFixture('tb')}>Add TB's desk</button>
        <button className="px-3 py-1.5 text-sm bg-white hover:bg-slate-50 border-l border-slate-300" onClick={() => addFixture('door')}>Add door</button>
        <button className="px-3 py-1.5 text-sm bg-white hover:bg-slate-50 border-l border-slate-300" onClick={() => addFixture('window')}>Add window</button>
      </div>
      <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={clearFixtures}>Clear fixtures</button>

      <div className="ml-auto flex items-center gap-2">
        <input type="file" accept="application/json" ref={importRef} onChange={onImport} className="text-sm" />
        <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={exportTemplate}>Export Template JSON</button>
      </div>
    </div>
  )
}
