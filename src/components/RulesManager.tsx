
import React, { useMemo, useState } from 'react'
import type { StudentMeta } from '../lib/types'
import { getDisplayName } from '../lib/utils'

type Pair = [string, string]
type RuleType = 'together' | 'apart'

export default function RulesManager({
  students,
  together,
  apart,
  onAdd,
  onRemove,
}: {
  students: StudentMeta[]
  together: Pair[]
  apart: Pair[]
  onAdd: (kind: RuleType, pair: Pair) => void
  onRemove: (kind: RuleType, index: number) => void
}) {
  const [a, setA] = useState<string>('')
  const [b, setB] = useState<string>('')

  const sorted = useMemo(() => students.slice().sort((x, y) => getDisplayName(x).localeCompare(getDisplayName(y))), [students])

  function add(kind: RuleType) {
    if (!a || !b || a === b) return
    onAdd(kind, [a, b])
  }

  function label(id: string) {
    const s = students.find(s => s.id === id)
    return s ? getDisplayName(s) : '(unknown)'
  }

  return (
    <div className="text-sm">
      <div className="flex gap-2 items-center">
        <select className="border rounded-md px-2 py-1.5 text-sm" value={a} onChange={e => setA(e.target.value)}>
          <option value="">Student A</option>
          {sorted.map(s => <option key={s.id} value={s.id}>{getDisplayName(s)}</option>)}
        </select>
        <select className="border rounded-md px-2 py-1.5 text-sm" value={b} onChange={e => setB(e.target.value)}>
          <option value="">Student B</option>
          {sorted.map(s => <option key={s.id} value={s.id}>{getDisplayName(s)}</option>)}
        </select>
        <button className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={() => add('together')}>Add together</button>
        <button className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50" onClick={() => add('apart')}>Add apart</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <div className="font-medium text-xs mb-1">Together</div>
          {together.length === 0 && <div className="text-xs text-slate-500">None</div>}
          <ul className="text-xs space-y-1">
            {together.map(([x, y], i) => (
              <li key={`t-${i}`} className="flex items-center justify-between">
                <span>{label(x)} + {label(y)}</span>
                <button className="text-slate-600 underline" onClick={() => onRemove('together', i)}>remove</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-medium text-xs mb-1">Apart</div>
          {apart.length === 0 && <div className="text-xs text-slate-500">None</div>}
          <ul className="text-xs space-y-1">
            {apart.map(([x, y], i) => (
              <li key={`a-${i}`} className="flex items-center justify-between">
                <span>{label(x)} × {label(y)}</span>
                <button className="text-slate-600 underline" onClick={() => onRemove('apart', i)}>remove</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
