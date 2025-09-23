// src/lib/storage.ts
import { PERIODS } from './constants'
import type {
  TemplateConfig,
  StudentsConfig,
  PeriodAssignments,
  RulesConfig,
  ExcludedSeats,
} from './types'

const KEY_TEMPLATE = 'sc.templateConfig.v1'
const KEY_STUDENTS = 'sc.studentsConfig.v1'
const KEY_ASSIGN   = 'sc.periodAssignments.v1'
const KEY_RULES    = 'sc.rulesConfig.v1'
const KEY_EXCLUDE  = 'sc.excludedSeats.v1'
const KEY_SCHEMA   = 'sc.schemaVersion'
const CURRENT_SCHEMA = 1

// -----------------------------
// JSON helpers: Map/Set support
// -----------------------------
function replacer(_key: string, value: any) {
  if (value instanceof Map) {
    return { __type: 'Map', entries: Array.from(value.entries()) }
  }
  if (value instanceof Set) {
    return { __type: 'Set', values: Array.from(value.values()) }
  }
  return value
}

function reviver(_key: string, value: any) {
  if (value && typeof value === 'object') {
    if (value.__type === 'Map' && Array.isArray(value.entries)) {
      return new Map(value.entries)
    }
    if (value.__type === 'Set' && Array.isArray(value.values)) {
      return new Set(value.values)
    }
  }
  return value
}

// -----------------------------
// LocalStorage IO (safe JSON)
// -----------------------------
function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw, reviver) as T
  } catch {
    return null
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value, replacer))
  } catch {
    // ignore quota/serialization errors
  }
}

// -----------------------------
// Schema bootstrap / defaults
// -----------------------------
export function ensureSchemaInitialized() {
  const version = Number(localStorage.getItem(KEY_SCHEMA) || '0')
  if (version !== CURRENT_SCHEMA) {
    // Clear old keys on schema change
    try {
      localStorage.removeItem(KEY_TEMPLATE)
      localStorage.removeItem(KEY_STUDENTS)
      localStorage.removeItem(KEY_ASSIGN)
      localStorage.removeItem(KEY_RULES)
      localStorage.removeItem(KEY_EXCLUDE)
      localStorage.setItem(KEY_SCHEMA, String(CURRENT_SCHEMA))
    } catch {
      // ignore
    }

    write(KEY_TEMPLATE, defaultTemplate())
    write(KEY_STUDENTS, defaultStudents())
    write(KEY_ASSIGN, defaultAssignments())
    write(KEY_RULES, defaultRules())
    write(KEY_EXCLUDE, defaultExcluded())
  } else {
    // Ensure presence if any key is missing/corrupt
    if (!safeRead<TemplateConfig>(KEY_TEMPLATE)) write(KEY_TEMPLATE, defaultTemplate())
    if (!safeRead<StudentsConfig>(KEY_STUDENTS)) write(KEY_STUDENTS, defaultStudents())
    if (!safeRead<PeriodAssignments>(KEY_ASSIGN)) write(KEY_ASSIGN, defaultAssignments())
    if (!safeRead<RulesConfig>(KEY_RULES)) write(KEY_RULES, defaultRules())
    if (!safeRead<ExcludedSeats>(KEY_EXCLUDE)) write(KEY_EXCLUDE, defaultExcluded())
  }
}

// -----------------------------
// Defaults
// -----------------------------
// Within-pair gap: 8, Between-pairs gap: 22, Row gap: 14,
// Card width: 120, Card min-height: 156
function defaultTemplate(): TemplateConfig {
  const within  = 0
  const between = 75
  const rowGap  = 14
  const cardW   = 120
  const cardH   = 156

  const desks: TemplateConfig['desks'] = []
  // 6 columns (3 pairs per row) × 6 rows = 36 desks
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const pairIndex = Math.floor(c / 2) // 0..2
      const inPair    = c % 2             // 0 or 1
      const x = pairIndex * (2 * cardW + within + between) + inPair * (cardW + within)
      const y = r * (cardH + rowGap)
      desks.push({ id: `d${r * 6 + c + 1}`, x, y, tags: [] })
    }
  }

  // Fixtures are explicitly included in the template so they persist
  const fixtures: TemplateConfig['fixtures'] = [
   
  ]

  return {
    desks,
    fixtures,
    spacing: {
      rowGap,
      colGap: between,
      withinPair: within,
      betweenPairs: between,
      cardW,
      cardH,
    },
  }
}

function defaultStudents(): StudentsConfig {
  return { p1: [], p3: [], p4: [], p5: [], p6: [] }
}

function defaultAssignments(): PeriodAssignments {
  const base: Record<string, string | null> = {}
  for (let i = 1; i <= 36; i++) base[`d${i}`] = null
  return {
    p1: { ...base },
    p3: { ...base },
    p4: { ...base },
    p5: { ...base },
    p6: { ...base },
  }
}

function defaultRules(): RulesConfig {
  return {
    p1: { together: [], apart: [] },
    p3: { together: [], apart: [] },
    p4: { together: [], apart: [] },
    p5: { together: [], apart: [] },
    p6: { together: [], apart: [] },
  }
}

function defaultExcluded(): ExcludedSeats {
  return { p1: [], p3: [], p4: [], p5: [], p6: [] }
}

// -----------------------------
// Public storage API
// -----------------------------
export const storage = {
  getTemplate(): TemplateConfig {
    return safeRead<TemplateConfig>(KEY_TEMPLATE) ?? defaultTemplate()
  },
  setTemplate(v: TemplateConfig) {
    // Persist desks, fixtures, and spacing all together
    write(KEY_TEMPLATE, v)
  },

  getStudents(): StudentsConfig {
    return safeRead<StudentsConfig>(KEY_STUDENTS) ?? defaultStudents()
  },
  setStudents(v: StudentsConfig) {
    write(KEY_STUDENTS, v)
  },

  getAssignments(): PeriodAssignments {
    return safeRead<PeriodAssignments>(KEY_ASSIGN) ?? defaultAssignments()
  },
  setAssignments(v: PeriodAssignments) {
    write(KEY_ASSIGN, v)
  },

  getRules(): RulesConfig {
    return safeRead<RulesConfig>(KEY_RULES) ?? defaultRules()
  },
  setRules(v: RulesConfig) {
    write(KEY_RULES, v)
  },

  getExcluded(): ExcludedSeats {
    return safeRead<ExcludedSeats>(KEY_EXCLUDE) ?? defaultExcluded()
  },
  setExcluded(v: ExcludedSeats) {
    write(KEY_EXCLUDE, v)
  },
}
