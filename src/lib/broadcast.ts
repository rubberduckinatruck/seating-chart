// Centralized broadcast helpers for app-wide refreshes.

import type { TemplateConfig } from './types'

export function broadcastStudentsUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent('seating:students-updated'))
  } catch {}
  // also trigger cross-tab "storage" event listeners
  try {
    localStorage.setItem('seating.bump.students', String(Date.now()))
  } catch {}
}

export function broadcastFixturesUpdated(fixtures: TemplateConfig['fixtures']): void {
  try {
    window.dispatchEvent(new CustomEvent('seating:fixtures-updated', { detail: { fixtures } }))
  } catch {}
  try {
    localStorage.setItem('seating.bump.fixtures', String(Date.now()))
  } catch {}
}
