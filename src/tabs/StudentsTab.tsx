
import { PERIODS } from '../lib/constants'
import { storage } from '../lib/storage'

export default function StudentsTab() {
  const students = storage.getStudents()
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Students (Global)</h2>
      <p className="text-sm text-slate-600">Edit names & tags here in later phases. Collapsible per-period sections will be added.</p>
      <ul className="list-disc pl-6 text-sm">
        {PERIODS.map(p => (
          <li key={p}>{p.toUpperCase()}: {students[p].length} students</li>
        ))}
      </ul>
    </div>
  )
}
