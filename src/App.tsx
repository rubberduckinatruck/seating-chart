import { useEffect, useMemo, useState } from 'react'
import { PERIODS, PRIMARY_TABS } from './lib/constants'
import Tabs from './components/Tabs'
import TemplateTab from './tabs/TemplateTab'
import StudentsTab from './tabs/StudentsTab'
import PeriodTab from './tabs/PeriodTab'
import { ensureSchemaInitialized } from './lib/storage'
import { syncStudentsFromManifests } from './lib/data'

export default function App() {
  const [active, setActive] = useState<string>(() => {
    return location.hash?.slice(1) || PERIODS[0]
  })

  // Gate rendering until storage is initialized and manifests synced
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        await Promise.resolve(ensureSchemaInitialized())
        // Try to sync from manifests; if it fails, we still proceed with local data
        try {
          await syncStudentsFromManifests()
        } catch (e: any) {
          // non-fatal: just log and continue
          console.warn('syncStudentsFromManifests failed:', e)
        }
      } catch (e: any) {
        setError(e?.message ?? 'Initialization failed')
      } finally {
        setReady(true)
      }
    })()
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
    if (PERIODS.includes(active)) return <PeriodTab periodId={active as any} />
    return <PeriodTab periodId={PERIODS[0] as any} />
  }

  if (!ready) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold mb-3">Seating Chart</h1>
          <div>Loading…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold mb-3">Seating Chart</h1>
          <div className="text-red-600">Error: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold mb-3">Seating Chart</h1>
        <Tabs
          tabs={tabs}
          active={active}
          onChange={(key) => {
            setActive(key)
            location.hash = key
          }}
        />
        <div className="mt-4">{renderTab()}</div>
      </div>
    </div>
  )
}
