
import { storage } from '../lib/storage'
import type { PeriodId } from '../lib/constants'

export default function PeriodTab({ periodId }: { periodId: PeriodId }) {
  const assign = storage.getAssignments()[periodId]
  const excluded = storage.getExcluded()[periodId]
  const rules = storage.getRules()[periodId]

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{periodId.toUpperCase()}</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 p-3 bg-white">
          <h3 className="font-medium mb-2">Seating (summary)</h3>
          <div>Assigned seats: {Object.values(assign).filter(Boolean).length} / {Object.keys(assign).length}</div>
          <div>Excluded seats: {excluded.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 bg-white">
          <h3 className="font-medium mb-2">Rules (summary)</h3>
          <div>Together pairs: {rules.together.length}</div>
          <div>Apart pairs: {rules.apart.length}</div>
        </div>
      </div>
      <p className="text-sm text-slate-600">Full interactive seating, per-period rules, and per-period excluded seats will be completed in subsequent phases.</p>
    </div>
  )
}
