import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill, PillButton } from '../components/ui/Pill.jsx'
import { CalendarGrid } from '../components/ui/CalendarGrid.jsx'
import { PendingRequestList } from '../components/ui/PendingRequestList.jsx'
import { downloadCsv } from '../components/ui/csv.js'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function iso(d) { return d.toISOString() }

export default function Installations() {
  const [searchParams] = useSearchParams()
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d })
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [actionCaseId, setActionCaseId] = useState('')
  const [view, setView] = useState('calendar')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get('/installations/calendar', { params: { start: iso(start), end: iso(end) } })
      setItems(res.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load installations') }
    finally { setLoading(false) }
  }

  async function sendCompletionEmail(caseId) {
    if (!caseId) return
    setActionCaseId(caseId); setError('')
    try { await api.post(`/cases/${caseId}/completion-email`); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to send completion email') }
    finally { setActionCaseId('') }
  }

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'all' || f === 'pending' || f === 'completed' || f === 'completed_email_pending') setFilter(f)
    const v = searchParams.get('view')
    if (v === 'calendar' || v === 'list') setView(v)
  }, [])

  useEffect(() => { load() }, [start, end])

  const sorted = useMemo(() => {
    let filtered = [...items]
    if (filter === 'pending') filtered = filtered.filter((x) => !x.completed_at)
    else if (filter === 'completed') filtered = filtered.filter((x) => !!x.completed_at)
    else if (filter === 'completed_email_pending') filtered = filtered.filter((x) => !!x.completed_at && !x.completion_email_sent)
    // Pending requests (no scheduled_date) are shown in PendingRequestList, not this table.
    return filtered
      .filter((s) => !!s.scheduled_date)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  }, [items, filter])

  const pending = useMemo(
    () => items.filter((s) => s.request_status === 'pending' && s.requested_date && !s.scheduled_date),
    [items],
  )

  const events = useMemo(() => {
    const scheduled = sorted
      .filter((s) => !!s.scheduled_date)
      .map((s) => {
        const dt = new Date(s.scheduled_date)
        const pill = s.completed_at
          ? <Pill tone={s.completion_email_sent ? 'emerald' : 'amber'}>{s.completion_email_sent ? 'email sent' : 'email pending'}</Pill>
          : <Pill tone="teal">scheduled</Pill>
        const titleParts = [s.reference_number, s.customer_nickname].filter(Boolean)
        const statusPill = s.case_status ? <Pill tone={toneForCaseStatus(s.case_status)}>{s.case_status}</Pill> : null
        return {
          id: `${s.case_id}-${s.scheduled_date}`,
          start: dt,
          href: `/admin/cases/${s.case_id}#installation`,
          tone: s.case_status ? toneForCaseStatus(s.case_status) : 'teal',
          title: <div className="flex flex-wrap items-center gap-1.5"><span>{titleParts.length ? titleParts.join(' · ') : 'Installation'}</span>{statusPill}</div>,
          subtitle: s.install_address || s.case_id,
          pill,
        }
      })
    const requested = pending.map((s) => ({
      id: `pending-${s.case_id}`,
      start: new Date(s.requested_date),
      href: `/admin/cases/${s.case_id}#installation`,
      tone: 'amber',
      title: <div className="flex flex-wrap items-center gap-1.5"><span>{[s.reference_number, s.customer_nickname].filter(Boolean).join(' · ') || 'Installation'}</span></div>,
      subtitle: s.install_address || s.case_id,
      pill: <Pill tone="amber">requested</Pill>,
    }))
    return [...scheduled, ...requested]
  }, [sorted, pending])

  function exportCsv() {
    const rows = [
      ['scheduled_date', 'case_id', 'completed_at', 'completion_email_sent', 'notes'],
      ...sorted.map((s) => [s.scheduled_date || '', s.case_id || '', s.completed_at || '', s.completion_email_sent ? 'yes' : 'no', s.notes || '']),
    ]
    downloadCsv(`installations-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Installations</h1>
            <p className="mt-1 text-sm text-slate-500">Calendar feed & list view.</p>
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter:</span>
              <PillButton active={filter === 'all'} tone="slate" onClick={() => setFilter('all')}>All</PillButton>
              <PillButton active={filter === 'pending'} tone="slate" onClick={() => setFilter('pending')}>Pending</PillButton>
              <PillButton active={filter === 'completed'} tone="emerald" onClick={() => setFilter('completed')}>Completed</PillButton>
              <PillButton active={filter === 'completed_email_pending'} tone="amber" onClick={() => setFilter('completed_email_pending')}>Completed, email pending</PillButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">View:</span>
              <PillButton active={view === 'calendar'} tone="teal" onClick={() => setView('calendar')}>Calendar</PillButton>
              <PillButton active={view === 'list'} tone="slate" onClick={() => setView('list')}>List</PillButton>
              <button type="button" onClick={exportCsv} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50">
                Export CSV
              </button>
            </div>
          </div>

          {loading && <div className="mt-4"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>}
          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <PendingRequestList items={pending} anchor="installation" title="Installation requests awaiting confirmation" />

          {view === 'calendar' ? (
            <div className="mt-4">
              <CalendarGrid start={start} end={end} events={events} emptyMessage="No installations in range." />
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-xl border">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Case ID</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Completion email</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((s) => (
                    <tr key={s.case_id + s.scheduled_date} className={`transition-colors hover:bg-slate-50 ${s.completed_at && !s.completion_email_sent ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-4 py-3">{new Date(s.scheduled_date).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        <Link className="text-emerald-600 hover:underline" to={`/admin/cases/${s.case_id}`}>{s.case_id}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.completed_at ? new Date(s.completed_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">
                        {s.completed_at ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill tone={s.completion_email_sent ? 'emerald' : 'amber'}>{s.completion_email_sent ? 'sent' : 'pending'}</Pill>
                            {!s.completion_email_sent && (
                              <button type="button" disabled={actionCaseId === s.case_id} onClick={() => sendCompletionEmail(s.case_id)}
                                className="rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60">
                                {actionCaseId === s.case_id ? 'Sending…' : 'Send'}
                              </button>
                            )}
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{s.notes || '—'}</td>
                    </tr>
                  ))}
                  {!loading && sorted.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No installations in range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  )
}
