
import type { StudentMeta } from './types'

export function getDisplayName(s: StudentMeta): string {
  if (s.displayName && s.displayName.trim().length > 0) return s.displayName.trim()
  return s.name
}

export function toggleInArray<T>(arr: T[], value: T): T[] {
  const i = arr.indexOf(value)
  if (i >= 0) return [...arr.slice(0, i), ...arr.slice(i + 1)]
  return [...arr, value]
}
