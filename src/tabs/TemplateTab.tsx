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

  // persist template changes (desks + fixtures + spacing all included)
  useEffect(() => {
    storage.setTemplate(cfg)
  }, [cfg])

  const cardW = cfg.spacing.cardW
  const cardH = cfg.spacing.cardH

  // --- centering & sizing ---
  const gridW = 3 * (2 * cardW + cfg.spacing.withinPair + cfg.spacing.betweenPairs)
  const gridH = 6 * (cfg.spacing.cardH + cfg.spacing.rowGap) + 100
  const EXTRA = 350 // tweak gutter space
  const outerW = Math.max(900, gridW + EXTRA)
  const TOP_PAD = 48 // space above row 1 for the label
  const outerH = gridH + TOP_PAD
  const leftPad = Math.floor((outerW - gridW) / 2)

  // ---- Desks ----
  function moveDesk(id: string, nx: number, ny: number) {
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
      const x =
        pairIndex * (2 * cardW + withinPair + betweenPairs) +
        inPair * (cardW + withinPair)
      const y = r * (cardH + rowGap)
      return { ...d, x, y }
    })
    setCfg(prev => ({ ...prev, desks }))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Template (Global Layout)</h2>
      <TemplateToolbar cfg={cfg} onChange={setCfg} />

      {/* Spacing controls */}
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

      {/* Outer canvas: wider; grid centered inside */}
      <div
        className="relative mx-auto border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
        style={{ width: outerW, height: outerH }}
      >
        {/* FRONT LABEL — grid-aligned in the top gutter (outside inner layer) */}
        <div
          className="absolute text-center text-[11px] font-medium tracking-wide text-slate-600 pointer-events-none z-20"
          style={{ left: leftPad, width: gridW, top: 6 }}
          aria-hidden="true"
        >
          FRONT OF CLASSROOM
        </div>

        {/* Centered inner layer (shifted down by TOP_PAD) */}
        <div
          className="absolute"
          style={{ top: TOP_PAD, left: leftPad, width: gridW, height: outerH - TOP_PAD }}
        >
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
              onMove={(nx, ny) => moveFixture(f.id, nx, ny)}
              onRemove={() => removeFixture(f.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
