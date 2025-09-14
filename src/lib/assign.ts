
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
 * Assign students to seats with priorities:
 * 1) Excluded seats are never auto-assigned
 * 2) Together/apart rules
 * 3) Student/desk tag matching
 * 4) Fill remaining randomly; record conflicts
 */
export function assignSeating(ctx: AssignContext, strategy: 'random' | 'alpha'): AssignResult {
  const seats = ctx.template.desks.map(d => d.id)
  const seatTags = new Map(ctx.template.desks.map(d => [d.id, d.tags as StudentTag[]]))
  const availableSeats = seats.filter(s => !ctx.excluded.has(s))

  const { togetherGroups, apartPairs } = buildConstraints(ctx)

  const students = ctx.students.slice()
  if (strategy === 'alpha') students.sort(byDisplayName)
  else students.sort(() => Math.random() - 0.5)

  const seatOf = new Map<string, string>() // studentId -> seatId
  const usedSeats = new Set<string>()
  const conflicts: string[] = []

  // 1) Place together groups in contiguous seat clusters (greedy)
  for (const group of togetherGroups) {
    const candidateClusters: string[][] = []
    for (let i = 0; i < availableSeats.length; i++) {
      const cluster = [availableSeats[i]]
      for (let j = i + 1; j < availableSeats.length && cluster.length < group.length; j++) {
        cluster.push(availableSeats[j])
      }
      if (cluster.length === group.length) candidateClusters.push(cluster)
    }
    const chosen = choice(candidateClusters)
    if (!chosen) {
      conflicts.push(`Could not seat group together: ${group.join(', ')}`)
      continue
    }
    const perm = strategy === 'alpha' ? group.slice() : arrayShuffled(group)
    for (let k = 0; k < perm.length; k++) {
      const sid = perm[k]
      const seatId = chosen[k]
      if (usedSeats.has(seatId)) continue
      const stu = students.find(s => s.id === sid)
      if (!stu) continue
      const ok = tagsMatch(stu.tags, seatTags.get(seatId))
      if (!ok) conflicts.push(`Tag mismatch: ${stu ? getDisplayName(stu) : sid} @ ${seatId}`)
      seatOf.set(sid, seatId)
      usedSeats.add(seatId)
    }
  }

  // 2) Place remaining students honoring "apart" preference when possible
  for (const stu of students) {
    if (seatOf.has(stu.id)) continue
    const prefs = availableSeats.filter(sid => !usedSeats.has(sid) && tagsMatch(stu.tags, seatTags.get(sid)))
    const candidates = prefs.length ? prefs : availableSeats.filter(sid => !usedSeats.has(sid))
    let placed = false
    for (const sid of candidates) {
      let violates = false
      for (const [otherId] of seatOf.entries()) {
        if (apartPairs.has(keyPair(stu.id, otherId))) {
          violates = true
          break
        }
      }
      if (!violates) {
        seatOf.set(stu.id, sid)
        usedSeats.add(sid)
        placed = true
        break
      }
    }
    if (!placed) {
      const sid = candidates.find(s => !usedSeats.has(s))
      if (sid) {
        seatOf.set(stu.id, sid)
        usedSeats.add(sid)
        conflicts.push(`Apart rule conflict for ${getDisplayName(stu)}`)
      } else {
        conflicts.push(`No seat available for ${getDisplayName(stu)}`)
      }
    }
  }

  return { seatOf, conflicts }
}
