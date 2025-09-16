// src/lib/broadcast.ts
// Centralized broadcast helpers for app-wide refreshes.
// - Uses CustomEvent on window for same-tab listeners
// - Uses a localStorage "bump" to fan out to other tabs (via the "storage" event)
// - (Optional) also posts via BroadcastChannel when available
//
// IMPORTANT: All payloads are "plainified" (Maps -> plain objects, Sets -> arrays)
// so nothing downstream tries to call `.get()` on a Map that got serialized
// through postMessage/structuredClone.

import type { TemplateConfig, StudentsConfig, StudentMeta } from './types'

// ---------------------------
// Event name constants
// ---------------------------
export const EVENTS = {
  students: 'seating:students-updated',
  fixtures: 'seating:fixtures-updated',
} as const

// ---------------------------
// Types
// ---------------------------

type PlainMap<T> = Record<string, T>

export type StudentsUpdatedDetail = {
  // Keep the canonical per-period lists as arrays of IDs (string[])
  students?: StudentsConfig
  // If you include a lookup table, send it as a plain object (not a Map)
  studentsById?: PlainMap<StudentMeta>
  // Optional reason to help debug UI flows
  reason?: 'reorder' | 'move' | 'tag' | 'sync' | 'load' | 'other'
}

export type FixturesUpdatedDetail = {
  fixtures: TemplateConfig['fixtures']
}

// ---------------------------
// Safe normalization helpers
// ---------------------------

/**
 * Convert Maps/Sets recursively into plain JSON-compatible structures.
 * - Map -> object via Object.fromEntries
 * - Set -> array
 */
function plainify(value: any): any {
  if (value instanceof Map) return Object.fromEntries(value)
  if (value instanceof Set) return Array.from(value)
  if (Array.isArray(value)) return value.map(plainify)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(value)) out[k] = plainify(value[k])
    return out
  }
  return value
}

// Optional BroadcastChannel to augment cross-tab fanout.
// (Your localStorage bump already handles this; BC just makes it snappier.)
const bc: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('seating-bus')
    : null

function postBC(type: keyof typeof EVENTS, detail: any) {
  try {
    bc?.postMessage({ type, detail })
  } catch {
    // noop
  }
}

// ---------------------------
// Public API
// ---------------------------

export function broadcastStudentsUpdated(detail?: StudentsUpdatedDetail): void {
  const safe = detail ? plainify(detail) : undefined

  // Same-tab listeners
  try {
    window.dispatchEvent(new CustomEvent(EVENTS.students, { detail: safe }))
  } catch {
    // noop
  }

  // Cross-tab (storage event bump)
  try {
    localStorage.setItem('seating.bump.students', String(Date.now()))
  } catch {
    // noop
  }

  // Cross-tab (BroadcastChannel)
  postBC('students', safe)
}

export function broadcastFixturesUpdated(detail: FixturesUpdatedDetail): void {
  const safe = plainify(detail)

  // Same-tab listeners
  try {
    window.dispatchEvent(new CustomEvent(EVENTS.fixtures, { detail: safe }))
  } catch {
    // noop
  }

  // Cross-tab (storage event bump)
  try {
    localStorage.setItem('seating.bump.fixtures', String(Date.now()))
  } catch {
    // noop
  }

  // Cross-tab (BroadcastChannel)
  postBC('fixtures', safe)
}

// ---------------------------
// Optional: listener helpers
// These are ergonomic wrappers so callers can subscribe/unsubscribe cleanly.
// They also mirror BroadcastChannel messages to the same handlers.
// ---------------------------

export function onStudentsUpdated(handler: (d: StudentsUpdatedDetail | undefined) => void): () => void {
  const evFn = (ev: Event) => handler((ev as CustomEvent).detail as StudentsUpdatedDetail | undefined)
  window.addEventListener(EVENTS.students, evFn)

  const bcFn = (msg: MessageEvent) => {
    if (msg?.data?.type === 'students') handler(msg.data.detail as StudentsUpdatedDetail | undefined)
  }
  bc?.addEventListener?.('message', bcFn)

  return () => {
    window.removeEventListener(EVENTS.students, evFn)
    bc?.removeEventListener?.('message', bcFn)
  }
}

export function onFixturesUpdated(handler: (d: FixturesUpdatedDetail) => void): () => void {
  const evFn = (ev: Event) => handler((ev as CustomEvent).detail as FixturesUpdatedDetail)
  window.addEventListener(EVENTS.fixtures, evFn)

  const bcFn = (msg: MessageEvent) => {
    if (msg?.data?.type === 'fixtures') handler(msg.data.detail as FixturesUpdatedDetail)
  }
  bc?.addEventListener?.('message', bcFn)

  return () => {
    window.removeEventListener(EVENTS.fixtures, evFn)
    bc?.removeEventListener?.('message', bcFn)
  }
}
