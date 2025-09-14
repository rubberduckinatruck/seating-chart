
import type { PeriodId } from './constants'

export type StudentTag = 'front row' | 'back row' | 'near TB'

export interface TemplateDesk {
  id: string
  x: number
  y: number
  tags: StudentTag[]
}

export type FixtureType = 'door' | 'window' | 'board' | 'projector'

export interface TemplateFixture {
  id: string
  type: FixtureType
  x: number
  y: number
}

export interface TemplateConfig {
  desks: TemplateDesk[]
  fixtures: TemplateFixture[]
  spacing: { rowGap: number; colGap: number }
}

export interface StudentMeta {
  id: string // filename reference
  name: string
  displayName?: string
  tags?: StudentTag[]
  notes?: string
}

export type StudentsConfig = Record<PeriodId, StudentMeta[]>

export type PeriodAssignments = Record<PeriodId, Record<string, string | null>> // seatId -> studentId

export interface PeriodRules {
  together: [string, string][]
  apart: [string, string][]
}

export type RulesConfig = Record<PeriodId, PeriodRules>

export type ExcludedSeats = Record<PeriodId, string[]> // seatIds per period

export interface StorageSnapshot {
  schemaVersion: number
  templateConfig: TemplateConfig
  studentsConfig: StudentsConfig
  periodAssignments: PeriodAssignments
  rulesConfig: RulesConfig
  excludedSeats: ExcludedSeats
}
