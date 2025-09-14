// src/components/TagPalette.tsx
import React from 'react'

const TAGS = ['front row', 'back row', 'near TB'] as const
export type AllowedTag = typeof TAGS[number]

export default function TagPalette() {
  function onDragStart(e: React.DragEvent, tag: AllowedTag) {
    e.dataTransfer.setData('text/tag', tag)
    e.dataTransfer.effectAllowed = 'copyMove'
  }
  return (
    <div className="flex flex-wrap gap-2">
      {TAGS.map((tag) => (
        <span
          key={tag}
          draggable
          onDragStart={(e) => onDragStart(e, tag)}
          className="inline-flex items-center px-2 py-1 rounded-full text-xs border bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing"
          title={`Drag onto a seat to toggle "${tag}"`}
        >
          {tag}
        </span>
      ))}
      <span className="text-xs text-slate-500 ml-2">(Drag onto a seat to toggle tag)</span>
    </div>
  )
}
