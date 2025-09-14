
interface TabItem { key: string; label: string }
export default function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={
            `px-3 py-1.5 rounded-md text-sm font-medium ` +
            (active === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50')
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
