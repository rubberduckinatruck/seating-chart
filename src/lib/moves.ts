// src/lib/moves.ts
export function findSeatOfStudent(assignments: Record<string, string | null>, studentId: string): string | null {
  for (const [seatId, sid] of Object.entries(assignments)) {
    if (sid === studentId) return seatId
  }
  return null
}

/**
 * Computes the result of moving a student onto a target seat.
 * - If target is excluded: returns {next: assignments, error: 'excluded'}
 * - If target is same seat: returns {next: assignments}
 * - If target empty: move
 * - If target occupied: swap
 */
export function moveOrSwapStudent(
  assignments: Record<string, string | null>,
  excluded: Set<string>,
  studentId: string,
  targetSeatId: string
): { next: Record<string, string | null>; error?: string } {
  if (excluded.has(targetSeatId)) return { next: assignments, error: 'excluded' }
  const fromSeatId = findSeatOfStudent(assignments, studentId)
  if (!fromSeatId) return { next: assignments } // dragged from unassigned list (not typical)
  if (fromSeatId === targetSeatId) return { next: assignments } // no-op
  const next = { ...assignments }
  const targetStudent = next[targetSeatId] ?? null
  next[targetSeatId] = studentId
  next[fromSeatId] = targetStudent
  return { next }
}
