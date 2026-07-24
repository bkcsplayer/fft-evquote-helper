import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell.jsx'
import { CalendarGrid } from '../../components/ui/CalendarGrid.jsx'
import { Pill, PillButton } from '../../components/ui/Pill.jsx'
import { api } from '../../services/api.js'
import { serviceKindLabel, toneForServiceKind } from '../../utils/serviceTone.js'

const SERVICES = ['ev', 'diagnostic', 'bird_netting', 'cleaning']

function iso(d) { return d.toISOString() }

export default function UnifiedSchedule() {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d })
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(() => new Set(SERVICES))

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get('/services/schedule', { params: { from: iso(start), to: iso(end) } })
      setItems(res.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load schedule') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [start, end])

  function toggle(service) {
    setVisible((prev) => {
      const next = new Set(prev)
      next.has(service) ? next.delete(service) : next.add(service)
      return next
    })
  }

  const events = useMemo(() => {
    return items
      .filter((it) => visible.has(it.service))
      .map((it) => ({
        id: it.id,
        start: new Date(it.start_at),
        href: it.link || '#',
        tone: toneForServiceKind(it.service),
        title: it.title || '—',
        subtitle: it.ref || undefined,
        pill: <Pill tone={toneForServiceKind(it.service)}>{serviceKindLabel(it.service)}</Pill>,
      }))
  }, [items, visible])

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Unified Schedule</h1>
            <p className="mt-1 text-sm text-slate-500">All four services, one calendar. EV rows are read-only here.</p>
          </div>
          <button type="button" onClick={load} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Start</span>
              <input type="date" value={start.toISOString().slice(0, 10)} onChange={(e) => setStart(new Date(e.target.value + 'T00:00:00'))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">End</span>
              <input type="date" value={end.toISOString().slice(0, 10)} onChange={(e) => setEnd(new Date(e.target.value + 'T23:59:59'))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
            <button type="button" onClick={load} className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95">
              Apply range
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Show:</span>
            {SERVICES.map((s) => (
              <PillButton key={s} active={visible.has(s)} tone={toneForServiceKind(s)} onClick={() => toggle(s)}>
                {serviceKindLabel(s)}
              </PillButton>
            ))}
          </div>

          {loading && <div className="mt-4"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>}
          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          {!loading && (
            <div className="mt-4">
              <CalendarGrid start={start} end={end} events={events} emptyMessage="No appointments in range." />
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
