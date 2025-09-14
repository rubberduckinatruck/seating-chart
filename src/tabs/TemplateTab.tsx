// src/tabs/TemplateTab.tsx
import { useEffect, useState } from 'react'
import { storage } from '../lib/storage'
import type { TemplateConfig, StudentTag } from '../lib/types'
import Seat from '../components/Seat'
import Fixture from '../components/Fixture'
import TemplateToolbar from '../components/TemplateToolbar'
import { intersects, type Rect } from '../lib/drag'

export default function TemplateTab() {
  const [cfg, setCfg] = useState<TemplateConfig>(() => storage.getTemplate())

  // persist template changes
  useEffect(() => {
    storage.setTemplate(cfg)
  }, [cfg])

  const cardW = cfg.spacing.cardW
  const cardH = cfg.spacing.cardH

  // ---- Desks ----
  function moveDesk(id: string, nx: number, ny: number) {
    // prevent overlap with other desks (simple AABB test)
    const meIdx = cfg.desks.findIndex(d => d.id === id)
    const myRect: Rect = { x: nx, y: ny, w: cardW, h: cardH }
    const collide = cfg.desks.some((d, i) =>
      i !== meIdx && intersects(myRect, { x: d.x, y: d.y, w: cardW, h: cardH })
    )
    if (collide) return
    setCfg(prev => ({
      ...prev,
      desks: prev.desks.map(d => (d.id === id ? { ...d, x: nx, y: ny } : d)),
    }))
  }

  function toggleDeskTag(id: string, tag: StudentTag) {
    setCfg(prev => ({
      ...prev,
      desks: prev.desks.map(d => {
        if (d.id !== id) return d
        const has = d.tags.includes(tag)
        return { ...d, tags: has ? d.tags.filter(t => t !== tag) : [...d.tags, tag] }
      }),
    }))
  }

  // ---- Fixtures ----
  function moveFixture(id: string, nx: number, ny: number) {
    setCfg(prev => ({
      ...prev,
      fixtures: prev.fixtures.map(f => (f.id === id ? { ...f, x: nx, y: ny } : f)),
    }))
  }

  function resizeFixture(id: string, nw: number, nh: number) {
    setCfg(prev => ({
      ...prev,
      fixtures: prev.fixtures.map(f => (f.id === id ? { ...f, w: nw, h: nh } : f)),
    }))
  }

  function removeFixture(id: string) {
    setCfg(prev => ({ ...prev, fixtures: prev.fixtures.filter(f => f.id !== id) }))
  }

  // ---- Spacing / grid ----
  function updateSpacing(partial: Partial<TemplateConfig['spacing']>) {
    setCfg(prev => ({ ...prev, spacing: { ...prev.spacing, ...partial } }))
  }

  function applyGrid() {
    const { cardW, cardH, withinPair, betweenPairs, rowGap } = cfg.spacing
    const desks = cfg.desks.map((d, index) => {
      const r = Math.floor(index / 6)
      const c = index % 6
      const pairIndex = Math.floor(c / 2)
      const inPair = c % 2
      const x = pairIndex * (2 * cardW + withinPair + betweenPairs) + inPair * (cardW + withinPair)
      const y = r * (cardH + rowGap)
      return { ...d, x, y }
    })
    setCfg(prev => ({ ...prev, desks }))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Template (Global Layout)</h2>
      <TemplateToolbar cfg={cfg} onChange={setCfg} />

      {/* Spacing controls (so you can see seat size) */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Within-pair gap (px)</label>
          <input
            type="number"
            value={cfg.spacing.withinPair}
            onChange={(e) => updateSpacing({ withinPair: Number(e.target.value) })}
            className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Between-pairs gap (px)</label>
          <input
            type="number"
            value={cfg.spacing.betweenPairs}
            onChange={(e) => updateSpacing({ betweenPairs: Number(e.target.value) })}
            className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Row gap (px)</label>
          <input
            type="number"
            value={cfg.spacing.rowGap}
            onChange={(e) => updateSpacing({ rowGap: Number(e.target.value) })}
            className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Card width (px)</label>
          <input
            type="number"
            value={cfg.spacing.cardW}
            onChange={(e) => updateSpacing({ cardW: Number(e.target.value) })}
            className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Card height (px)</label>
          <input
            type="number"
            value={cfg.spacing.cardH}
            onChange={(e) => updateSpacing({ cardH: Number(e.target.value) })}
            className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          className="ml-2 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          onClick={applyGrid}
        >
          Apply grid
        </button>
      </div>

      <div
        className="relative border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
        style={{
          width: Math.max(900, 3 * (2 * cardW + cfg.spacing.withinPair + cfg.spacing.betweenPairs)),
          height: 6 * (cfg.spacing.cardH + cfg.spacing.rowGap) + 100,
        }}
      >
        {/* Board indicator (doesn't block drags) */}
        <div className="absolute left-0 right-0 top-2 text-center text-xs text-slate-500 pointer-events-none">
          Front of classroom
        </div>

        {/* Desks */}
        {cfg.desks.map(d => (
          <Seat
            key={d.id}
            id={d.id}
            x={d.x}
            y={d.y}
            w={cfg.spacing.cardW}
            h={cfg.spacing.cardH}
            tags={d.tags}
            onMove={(nx, ny) => moveDesk(d.id, nx, ny)}
            onToggleTag={(tag) => toggleDeskTag(d.id, tag)}
          />
        ))}

        {/* Fixtures */}
        {cfg.fixtures.map(f => (
          <Fixture
            key={f.id}
            id={f.id}
            type={f.type}
            x={f.x}
            y={f.y}
            w={f.w}
            h={f.h}
            onMove={(nx, ny) => moveFixture(f.id, nx, ny)}
            onResize={(nw, nh) => resizeFixture(f.id, nw, nh)}
            onRemove={() => removeFixture(f.id)}
          />
        ))}
      </div>
    </div>
  )
}
