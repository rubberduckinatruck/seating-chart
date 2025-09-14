
import React from 'react'

export default function AssignmentToolbar({
  onRandomize,
  onSortAlpha,
  onClearAll,
  disabled = false,
}: {
  onRandomize: () => void
  onSortAlpha: () => void
  onClearAll: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onRandomize}
        className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60"
      >
        Randomize
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onSortAlpha}
        className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60"
      >
        Sort A→Z
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onClearAll}
        className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60"
      >
        Clear all
      </button>
    </div>
  )
}
