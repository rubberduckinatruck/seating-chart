// src/lib/utils.ts
import type { StudentMeta } from './types'

/**
 * Get a student's display name.
 */
export function getDisplayName(s: StudentMeta): string {
  if (s.displayName && s.displayName.trim().length > 0) return s.displayName.trim()
  return s.name
}

/**
 * Toggle a value inside an array (immutably).
 */
export function toggleInArray<T>(arr: T[], value: T): T[] {
  const i = arr.indexOf(value)
  if (i >= 0) return [...arr.slice(0, i), ...arr.slice(i + 1)]
  return [...arr, value]
}

/**
 * Type guard: check if a value is a Map.
 */
export function isMap(x: any): x is Map<any, any> {
  return x && typeof x.get === 'function'
}

/**
 * Safely access an item from a Map or plain object index.
 * Falls back to object lookup if not a Map.
 */
export function fromIndex<T>(
  index: Map<string, T> | Record<string, T>,
  id: string
): T | undefined {
  return isMap(index) ? index.get(id) : (index as Record<string, T>)[id]
}

/**
 * Safely set an item on a Map or plain object index.
 */
export function setIndex<T>(
  index: Map<string, T> | Record<string, T>,
  id: string,
  val: T
) {
  if (isMap(index)) index.set(id, val)
  else (index as Record<string, T>)[id] = val
}

/**
 * Rehydrate a value that was originally a Map but may have
 * been serialized into a plain object (e.g. via JSON or postMessage).
 */
export function rehydrateMap<T = unknown>(maybe: any): Map<string, T> {
  if (isMap(maybe)) return maybe
  if (maybe && typeof maybe === 'object') return new Map<string, T>(Object.entries(maybe))
  return new Map<string, T>()
}

/**
 * Rehydrate a value that was originally a Set but may have
 * been serialized into an array or object.
 */
export function rehydrateSet(maybe: any): Set<string> {
  if (maybe instanceof Set) return maybe
  if (Array.isArray(maybe)) return new Set(maybe)
  if (maybe && typeof maybe === 'object') return new Set(Object.keys(maybe))
  return new Set<string>()
}
