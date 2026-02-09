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
 * 1) Place together-groups first (tagged groups are prioritized).
 * 2) Place students involved in "apart" rules next (try to keep them separated).
 * 3) Place remaining students (tags REQUIRED), recording conflicts.
 *
 * Important behavior changes:
 * - Seat tags are treated as HARD constraints: if a student has tags, they will only be placed
 *   into seats whose tags satisfy tagsMatch(...). No tag-violating fallback placement is performed.
 * - Together-groups are only placed into adjacent clusters that can satisfy tags for all group members.
 */
export function assignSeating(ctx: AssignContext, strategy: 'random' | 'alpha'): AssignResult {
  // defensive: ignore rule pairs referencing students not present in this period
  const presentSet = new Set(ctx.students.map(s => s.id))
  const togetherClean = ctx.rules.together.filter(([a, b]) => presentSet.has(a) && presentSet.has(b))
  const apartClean = ctx.rules.apart.filter(([a, b]) => presentSet.has(a) && presentSet.has(b))
  if (togetherClean.length !== ctx.rules.together.length || apartClean.length !== ctx.rules.apart.length) {
    const removedTogether = ctx.rules.together.filter(([a, b]) => !(presentSet.has(a) && presentSet.has(b)))
    const removedApart = ctx.rules.apart.filter(([a, b]) => !(presentSet.has(a) && presentSet.has(b)))
    console.warn('assignSeating: filtering out rule pairs referencing missing students:', {
      removedTogether,
      removedApart,
    })
  }

  const seats = ctx.template.desks.map(d => d.id)
  const seatTags = new Map(ctx.template.desks.map(d => [d.id, d.tags as StudentTag[]]))
  const availableSeats = seats.filter(s => !ctx.excluded.has(s))

  const neighbors = buildAdjacency(ctx.template)
  const { togetherGroups, apartPairs } = buildConstraints({
    ...ctx,
    rules: { together: togetherClean, apart: apartClean },
  })

  let students = ctx.students.slice()
  if (strategy === 'alpha') students.sort(byDisplayName)
  else students = arrayShuffled(students)

  const seatOf = new Map<string, string>() // studentId -> seatId
  const usedSeats = new Set<string>()
  const conflicts: string[] = []

  // -----------------------------
  // 0) Helper maps for quick lookups
  // -----------------------------
  const studentById = new Map(students.map(s => [s.id, s]))
  const apartAdj = new Map<string, Set<string>>() // studentId -> set of studentIds they must be apart from
  for (const [a, b] of apartClean) {
    if (!apartAdj.has(a)) apartAdj.set(a, new Set())
    if (!apartAdj.has(b)) apartAdj.set(b, new Set())
    apartAdj.get(a)!.add(b)
    apartAdj.get(b)!.add(a)
  }

  // Helper: candidates for a student with tags treated as HARD constraint
  function candidateSeatsForStudent(stu: StudentMeta, onlyUnused: boolean) {
    const base = onlyUnused ? availableSeats.filter(sid => !usedSeats.has(sid)) : availableSeats.slice()
    if (!stu.tags || stu.tags.length === 0) return base
    return base.filter(seatId => tagsMatch(stu.tags, seatTags.get(seatId)))
  }

  // Helper: determine if a cluster can satisfy tag requirements for all group members
  function clusterCanFitGroupByTags(group: string[], cluster: string[]): boolean {
    const sids = group.slice()
    const seatsCluster = cluster.slice()

    // most constrained students first
    sids.sort((a, b) => {
      const sa = studentById.get(a)
      const sb = studentById.get(b)
      const ca = seatsCluster.filter(seatId => tagsMatch(sa?.tags, seatTags.get(seatId))).length
      const cb = seatsCluster.filter(seatId => tagsMatch(sb?.tags, seatTags.get(seatId))).length
      return ca - cb
    })

    const used = new Set<string>()
    function bt(i: number): boolean {
      if (i >= sids.length) return true
      const stu = studentById.get(sids[i])
      if (!stu) return false
      for (const seatId of seatsCluster) {
        if (used.has(seatId)) continue
        if (!tagsMatch(stu.tags, seatTags.get(seatId))) continue
        used.add(seatId)
        if (bt(i + 1)) return true
        used.delete(seatId)
      }
      return false
    }

    return bt(0)
  }

  // -----------------------------
  // 1) Place together groups FIRST (tagged groups prioritized), adjacency-aware backtracking
  // -----------------------------
  const taggedGroups: string[][] = []
  const untaggedGroups: string[][] = []
  for (const g of togetherGroups) {
    const isTagged = g.some(sid => {
      const stu = studentById.get(sid)
      return !!stu && Array.isArray(stu.tags) && stu.tags.length > 0
    })
    if (isTagged) taggedGroups.push(g)
    else untaggedGroups.push(g)
  }

  const orderedGroups = taggedGroups.concat(untaggedGroups)

  // Build candidate clusters for each together group (connected clusters of the needed size)
  const groupClustersArr: { group: string[]; clusters: string[][] }[] = []
  for (const group of orderedGroups) {
    const clusters: string[][] = []
    // For each possible start seat, BFS-grow a connected cluster of required size
    for (const start of availableSeats) {
      if (usedSeats.has(start)) continue

      const cluster: string[] = [start]
      const seen = new Set(cluster)
      const queue = [start]

      while (queue.length && cluster.length < group.length) {
        const cur = queue.shift()!
        for (const nb of neighbors.get(cur) ?? []) {
          if (usedSeats.has(nb)) continue
          if (seen.has(nb)) continue
          if (!availableSeats.includes(nb)) continue
          seen.add(nb)
          cluster.push(nb)
          queue.push(nb)
          if (cluster.length >= group.length) break
        }
      }

      if (cluster.length === group.length) {
        // Ensure canonical order for cluster to avoid duplicates: sort by index in availableSeats
        const ordered = cluster
          .slice()
          .sort((a, b) => availableSeats.indexOf(a) - availableSeats.indexOf(b))

        // NEW: tags are REQUIRED for group placement; only accept clusters that can satisfy tags for all members
        if (!clusterCanFitGroupByTags(group, ordered)) continue

        if (!clusters.some(c => c.join('|') === ordered.join('|'))) clusters.push(ordered)
      }
    }
    groupClustersArr.push({ group, clusters })
  }

  // Sort groups by fewest candidate clusters first — heuristic to improve backtracking speed
  groupClustersArr.sort((a, b) => a.clusters.length - b.clusters.length)

  // Backtracking search to pick non-overlapping clusters for each group
  const chosenClustersForIdx = new Map<number, string[]>()

  function backtrackPickGroups(idx: number, used: Set<string>): boolean {
    if (idx >= groupClustersArr.length) return true
    const { clusters } = groupClustersArr[idx]
    if (clusters.length === 0) return false

    const order = arrayShuffled(clusters)
    for (const cluster of order) {
      if (cluster.some(sid => used.has(sid))) continue

      for (const sid of cluster) used.add(sid)
      chosenClustersForIdx.set(idx, cluster)

      const ok = backtrackPickGroups(idx + 1, used)
      if (ok) return true

      chosenClustersForIdx.delete(idx)
      for (const sid of cluster) used.delete(sid)
    }

    return false
  }

  const initialUsedForGroups = new Set<string>([...usedSeats])
  const okGroups = backtrackPickGroups(0, initialUsedForGroups)

  if (okGroups) {
    // materialize assignments for chosen clusters
    for (let idx = 0; idx < groupClustersArr.length; idx++) {
      const group = groupClustersArr[idx].group
      const cluster = chosenClustersForIdx.get(idx)
      if (!cluster) continue

      const perm = strategy === 'alpha' ? group.slice() : arrayShuffled(group)

      // Assign group members to seats using a tag-feasible mapping (backtracking)
      // This guarantees we don't accidentally mismatch tags based on ordering.
      const permSorted = perm.slice()
      permSorted.sort((a, b) => {
        const sa = studentById.get(a)
        const sb = studentById.get(b)
        const ca = cluster.filter(seatId => tagsMatch(sa?.tags, seatTags.get(seatId))).length
        const cb = cluster.filter(seatId => tagsMatch(sb?.tags, seatTags.get(seatId))).length
        return ca - cb
      })

      const usedLocal = new Set<string>()
      const localAssign = new Map<string, string>() // sid -> seatId

      function bt(i: number): boolean {
        if (i >= permSorted.length) return true
        const sid = permSorted[i]
        const stu = studentById.get(sid)
        if (!stu) return false
        for (const seatId of cluster) {
          if (usedLocal.has(seatId)) continue
          if (!tagsMatch(stu.tags, seatTags.get(seatId))) continue
          usedLocal.add(seatId)
          localAssign.set(sid, seatId)
          if (bt(i + 1)) return true
          localAssign.delete(sid)
          usedLocal.delete(seatId)
        }
        return false
      }

      const okMap = bt(0)
      if (!okMap) {
        // This should not happen because clusters were filtered by clusterCanFitGroupByTags,
        // but keep it safe.
        conflicts.push(`Could not seat group together: ${group.join(', ')}`)
        continue
      }

      for (const [sid, seatId] of localAssign.entries()) {
        if (usedSeats.has(seatId)) continue
        const stu = studentById.get(sid)
        if (!stu) continue
        seatOf.set(sid, seatId)
        usedSeats.add(seatId)
      }
    }
  } else {
    // When backtracking failed, record conflicts for groups that have no non-overlapping cluster set
    for (const { group, clusters } of groupClustersArr) {
      if (clusters.length === 0) {
        conflicts.push(`Could not seat group together: ${group.join(', ')}`)
      } else {
        conflicts.push(
          `Could not place all together-groups without overlap; group: ${group.join(', ')}`
        )
      }
    }
  }

  // -----------------------------
  // 2) Place students involved in "apart" rules NEXT (tags REQUIRED)
  // -----------------------------
  const apartStudents = Array.from(apartAdj.keys()).filter(sid => studentById.has(sid))
  if (apartStudents.length < apartAdj.size) {
    const missing = Array.from(apartAdj.keys()).filter(sid => !studentById.has(sid))
    console.warn('assignSeating: apart rules reference missing students:', missing)
  }

  // sort by degree desc (students with many apart constraints first)
  apartStudents.sort((a, b) => (apartAdj.get(b)!.size - apartAdj.get(a)!.size))

  // Precompute candidate seats per apart-student (tags REQUIRED if student has tags)
  const apartCandidates = new Map<string, string[]>()
  for (const sid of apartStudents) {
    const stu = studentById.get(sid)
    if (!stu) {
      console.warn('assignSeating: apart student not present in students list:', sid)
      apartCandidates.set(sid, [])
      continue
    }
    apartCandidates.set(sid, candidateSeatsForStudent(stu, true))
  }

  // Backtracking to assign seats to apartStudents such that none are adjacent to their apart partners
  const chosenApart = new Map<string, string>() // studentId -> seatId

  function backtrackApart(idx: number, used: Set<string>): boolean {
    if (idx >= apartStudents.length) return true
    const sid = apartStudents[idx]
    const stu = studentById.get(sid)
    if (!stu) return false

    const cand = apartCandidates.get(sid) || []
    const order = arrayShuffled(cand)

    for (const seatId of order) {
      if (used.has(seatId)) continue

      let violates = false
      const partners = apartAdj.get(sid) || new Set()
      for (const p of partners) {
        const placedSeat = chosenApart.get(p) || seatOf.get(p)
        if (!placedSeat) continue
        if ((neighbors.get(seatId)?.has(placedSeat)) === true) {
          violates = true
          break
        }
      }
      if (violates) continue

      used.add(seatId)
      chosenApart.set(sid, seatId)
      const ok = backtrackApart(idx + 1, used)
      if (ok) return true
      chosenApart.delete(sid)
      used.delete(seatId)
    }

    return false
  }

  // Start used set includes seats already taken by together-groups
  const okApart = backtrackApart(0, new Set([...usedSeats]))
  if (okApart) {
    for (const [sid, seatId] of chosenApart.entries()) {
      const stu = studentById.get(sid)
      if (!stu) continue
      // tags REQUIRED: if this is somehow false, treat as failure (shouldn't happen)
      if (!tagsMatch(stu.tags, seatTags.get(seatId))) {
        conflicts.push(`No tag-valid seat for ${getDisplayName(stu)}`)
        continue
      }
      if (usedSeats.has(seatId)) continue
      seatOf.set(sid, seatId)
      usedSeats.add(seatId)
    }
  } else {
    // Can't satisfy all apart constraints simultaneously. Greedy attempt, but still tags REQUIRED.
    for (const sid of apartStudents) {
      if (seatOf.has(sid)) continue
      const stu = studentById.get(sid)
      if (!stu) {
        conflicts.push(`No student data for apart student ${sid}`)
        continue
      }

      const cand = candidateSeatsForStudent(stu, true)
      if (cand.length === 0) {
        conflicts.push(`No tag-valid seat for ${getDisplayName(stu)}`)
        continue
      }

      let placed = false
      for (const seatId of arrayShuffled(cand)) {
        if (usedSeats.has(seatId)) continue
        let violates = false
        const partners = apartAdj.get(sid) || new Set()
        for (const p of partners) {
          const otherSeat = seatOf.get(p)
          if (!otherSeat) continue
          if ((neighbors.get(seatId)?.has(otherSeat)) === true) {
            violates = true
            break
          }
        }
        if (!violates) {
          seatOf.set(sid, seatId)
          usedSeats.add(seatId)
          placed = true
          break
        }
      }

      if (!placed) {
        // Tags are required, so we do NOT fall back to an arbitrary seat. Record the apart conflict.
        conflicts.push(`Apart rule conflict for ${getDisplayName(stu)}`)
      }
    }
  }

  // -----------------------------
  // 3) Place remaining students (tags REQUIRED), honoring "apart" preference when possible
  // -----------------------------
  for (const stu of students) {
    if (seatOf.has(stu.id)) continue

    // Tags REQUIRED: if a student has tags, they may have 0 valid seats left.
    const tagValidUnused = candidateSeatsForStudent(stu, true)
    if (stu.tags && stu.tags.length > 0 && tagValidUnused.length === 0) {
      conflicts.push(`No tag-valid seat for ${getDisplayName(stu)}`)
      continue
    }

    // Prefer tag-valid seats; for untagged students, any unused seat is fine.
    const candidates = tagValidUnused.length ? tagValidUnused : availableSeats.filter(sid => !usedSeats.has(sid))

    let placed = false
    for (const sid of candidates) {
      let violates = false
      for (const [otherId, otherSeat] of seatOf.entries()) {
        if (!apartPairs.has(keyPair(stu.id, otherId))) continue
        if ((neighbors.get(sid)?.has(otherSeat)) === true) {
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
      // If untagged, we can still place them (apart conflict). If tagged, candidates already tag-valid.
      const sid = candidates.find(s => !usedSeats.has(s))
      if (sid) {
        seatOf.set(stu.id, sid)
        usedSeats.add(sid)

        const hadApartConflict = Array.from(seatOf.entries()).some(([otherId, otherSeat]) =>
          apartPairs.has(keyPair(stu.id, otherId)) && (neighbors.get(sid)?.has(otherSeat) === true)
        )
        if (hadApartConflict) conflicts.push(`Apart rule conflict for ${getDisplayName(stu)}`)
      } else {
        conflicts.push(`No seat available for ${getDisplayName(stu)}`)
      }
    }
  }

  return { seatOf, conflicts }
}
