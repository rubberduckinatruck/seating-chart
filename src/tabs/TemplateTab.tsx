
import { storage } from '../lib/storage'

export default function TemplateTab() {
  const template = storage.getTemplate()
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Template (Global)</h2>
      <p className="text-sm text-slate-600">Global layout, fixtures, desk tags (source of truth for all periods). Phase 1+ will make this fully editable.</p>
      <div className="text-sm">
        <div>Desks: {template.desks.length}</div>
        <div>Fixtures: {template.fixtures.length}</div>
        <div>Row gap: {template.spacing.rowGap}px, Col gap: {template.spacing.colGap}px</div>
      </div>
    </div>
  )
}
