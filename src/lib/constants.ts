
export const PERIODS = ['p1','p3','p4','p5','p6'] as const
export type PeriodId = typeof PERIODS[number]

export const FIXED_STUDENT_TAGS = [
  'front row',
  'back row',
  'near TB'
] as const

export const PRIMARY_TABS = [
  { key: 'template', label: 'Template' },
  { key: 'students', label: 'Students' },
  ...PERIODS.map(p => ({ key: p, label: p.toUpperCase() }))
]
