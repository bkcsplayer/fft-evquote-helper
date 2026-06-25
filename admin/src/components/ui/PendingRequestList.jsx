import { Link } from 'react-router-dom'
import { Pill } from './Pill.jsx'

// "Customer requested a time, awaiting your confirmation" todo list, shown above a calendar.
export function PendingRequestList({ items, anchor, title = 'Awaiting your confirmation' }) {
  if (!items?.length) return null
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="text-sm font-bold text-amber-900">{title} ({items.length})</span>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((s) => (
          <Link
            key={s.case_id}
            to={`/admin/cases/${s.case_id}#${anchor}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 transition-colors hover:bg-amber-100/50"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{[s.reference_number, s.customer_nickname].filter(Boolean).join(' · ')}</div>
              <div className="truncate text-xs text-slate-500">{s.install_address || s.case_id}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-800">{s.requested_date ? new Date(s.requested_date).toLocaleString() : '—'}</span>
              <Pill tone="amber">confirm →</Pill>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
