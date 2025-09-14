
import { useEffect, useMemo, useState } from 'react'
import { PERIODS, PRIMARY_TABS } from './lib/constants'
import Tabs from './components/Tabs'
import TemplateTab from './tabs/TemplateTab'
import StudentsTab from './tabs/StudentsTab'
import PeriodTab from './tabs/PeriodTab'
import { ensureSchemaInitialized } from './lib/storage'

export default function App() {
  const [active, setActive] = useState<string>(() => {
    return location.hash?.slice(1) || PERIODS[0]
  })

  // Initialize / reset storage on first load per schemaVersion
  useEffect(() => {
    ensureSchemaInitialized()
  }, [])

  // Persist tab in URL hash (so reload stays on tab)
  useEffect(() => {
    const onHash = () => setActive(location.hash.slice(1) || PERIODS[0])
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const tabs = useMemo(() => PRIMARY_TABS, [])

  const renderTab = () => {
    if (active === 'template') return <TemplateTab />
    if (active === 'students') return <StudentsTab />
    if (PERIODS.includes(active)) return <PeriodTab periodId={active} />
    return <PeriodTab periodId={PERIODS[0]} />
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold mb-3">Seating Chart</h1>
        <Tabs tabs={tabs} active={active} onChange={(key) => {
          setActive(key)
          location.hash = key
        }} />
        <div className="mt-4">
          {renderTab()}
        </div>
      </div>
    </div>
  )
}
