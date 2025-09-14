
import React, { useRef } from 'react'
import { exportElementAsPdf, exportElementAsPng } from '../lib/export'

export default function ExportButtons({ targetSelector, fileBase }:
  { targetSelector: string; fileBase?: string }) {
  const busyRef = useRef(false)

  async function onPng() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const el = document.querySelector<HTMLElement>(targetSelector)
      if (!el) return alert('Export target not found')
      await exportElementAsPng(el, (fileBase || 'seating-chart') + '.png')
    } finally {
      busyRef.current = false
    }
  }

  async function onPdf() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const el = document.querySelector<HTMLElement>(targetSelector)
      if (!el) return alert('Export target not found')
      await exportElementAsPdf(el, (fileBase || 'seating-chart') + '.pdf')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <div className="flex gap-2">
      <button onClick={onPng} className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50">Export PNG</button>
      <button onClick={onPdf} className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50">Export PDF</button>
    </div>
  )
}
