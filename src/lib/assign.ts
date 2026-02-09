// src/lib/assign.ts
import type { TemplateConfig, StudentMeta, StudentTag } from './types'
import { getDisplayName } from './utils'

export type Pair = [string, string]
export type RuleSet = { together: Pair[]; apart: Pair[] }

export interface AssignContext {
  template: TemplateConfig
  students: StudentMeta[]
  excluded: Set<string> // seatIds
  rules: RuleSet
}

export type AssignResult = {
  seatOf: Map<string, string> // studentId -> seatId
  conflicts: string[]
}

function byDisplayName(a: StudentMeta, b: StudentMeta) {
  return getDisplayName(a).localeCompare(getDisplayName(b))
}
function choice<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)]
}
function arrayShuffled<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function hasAny<T>(a: T[] | undefined | null, b: T[] | undefined | null) {
  if (!a || !b) return false
  return a.some(x => b.includes(x as any))
}
function tagsMatch(studentTags?: StudentTag[], deskTags?: StudentTag[]) {
  if (!studentTags || studentTags.length === 0) return true // no preference
  if (!deskTags || deskTags.length === 0) return false // student has tag but desk doesn't
  return studentTags.every(t => deskTags.includes(t))
}
function hasAnyPairs(ids: string[], pairs: Pair[]) {
  const set = new Set(ids)
  return pairs.some(([a, b]) => set.has(a) && set.has(b))
}
function keyPair(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

class UnionFind<T extends string> {
  parent = new Map<T, T>()
  find(x: T): T {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p !== x) this.parent.set(x, this.find(p))
    return this.parent.get(x)!
  }
  union(x: T, y: T) {
    const rx = this.find(x)
    const ry = this.find(y)
    if (rx !== ry) this.parent.set(rx, ry)
  }
}

function buildConstraints(ctx: AssignContext) {
  const togetherGroups: string[][] = []
  const uf = new UnionFind<string>()
  for (const [a, b] of ctx.rules.together) uf.union(a, b)
  const grpMap = new Map<string, string[]>()
  for (const s of ctx.students) {
    const root = uf.find(s.id)
    if (!grpMap.has(root)) grpMap.set(root, [])
    grpMap.get(root)!.push(s.id)
  }
  for (const g of grpMap.values()) {
    if (g.length > 1 && hasAnyPairs(g, ctx.rules.together)) togetherGroups.push(g)
  }
  const apartPairs = new Set<string>(ctx.rules.apart.map(p => keyPair(p[0], p[1])))
  return { togetherGroups, apartPairs }
}

/**
 * Build adjacency using row grouping:
 * - Seats grouped into rows by their y coordinate (tolerance).
 * - Immediate left/right neighbors in the same row are considered adjacent.
 * - Optional front/back adjacency (commented) is available.
 */
function buildAdjacency(template: TemplateConfig) {
  const pos = new Map<string, { x: number; y: number }>()
  for (const d of template.desks) pos.set(d.id, { x: d.x, y: d.y })

  // Group seats into rows by their 'y' coordinate (allow small tolerance)
  const rows: { y: number; seats: { id: string; x: number }[] }[] = []
  const Y_TOLERANCE = 12 // pixels; tweak if your rows are not perfectly aligned

  for (const d of template.desks) {
    const y = d.y
    let row = rows.find(r => Math.abs(r.y - y) <= Y_TOLERANCE)
    if (!row) {
      row = { y, seats: [] }
      rows.push(row)
    }
    row.seats.push({ id: d.id, x: d.x })
  }

  // Sort rows top-to-bottom and seats left-to-right
  rows.sort((a, b) => a.y - b.y)
  for (const r of rows) r.seats.sort((a, b) => a.x - b.x)

  // Build neighbors: immediate left/right in row
  const neighbors = new Map<string, Set<string>>()
  for (const d of template.desks) neighbors.set(d.id, new Set())

  for (const r of rows) {
    for (let i = 0; i < r.seats.length; i++) {
      const cur = r.seats[i].id
      const left = r.seats[i - 1]?.id
      const right = r.seats[i + 1]?.id
      if (left) {
        neighbors.get(cur)!.add(left)
      }
      if (right) {
        neighbors.get(cur)!.add(right)
      }
    }
  }

  // OPTIONAL: front/back adjacency (disabled by default)
  /*
  const V_X_TOLERANCE = 16
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const top = rows[ri]
    const bot = rows[ri + 1]
    for (const ts of top.seats) {
      for (const bs of bot.seats) {
        if (Math.abs(ts.x - bs.x) <= V_X_TOLERANCE) {
          neighbors.get(ts.id)!.add(bs.id)
          neighbors.get(bs.id)!.add(ts.id)
        }
      }
    }
  }
  */

  return neighbors
}

/**
 * Assign students to seats with priorities:
 * 1) Place students involved in "apart" rules first (try to keep them separated).
 * 2) Place together-groups in adjacent clusters (backtracking to avoid overlap).
 * 3) Place remaining students (tags preferred), recording conflicts.
 */
export function assignSeating(ctx: AssignContext, strategy: 'random' | 'alp
