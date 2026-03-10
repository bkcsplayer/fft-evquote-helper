import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadCsv } from '../components/ui/csv.js'
import { Pill, PillButton } from '../components/ui/Pill.jsx'
import { CalendarGrid } from '../components/ui/CalendarGrid.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function iso(d) {
  return d.toISOString()
}

export default function Installations() {
  const [searchParams] = useSearchParams()
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d
  })
  const [end, setEnd] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d
  })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // all | pending | completed | completed_email_pending
  const [actionCaseId, setActionCaseId] = useState('')
  const [view, setView] = useState('calendar') // calendar | list

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/installations/calendar', { params: { start: iso(start), end: iso(end) } })
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load installations')
    } finally {
      setLoading(false)
    }
  }

  async function sendCompletionEmail(caseId) {
    if (!caseId) return
    setActionCaseId(caseId)
    setError('')
    try {
      await api.post(`/cases/${caseId}/completion-email`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to send completion email')
    } finally {
      setActionCaseId('')
    }
  }

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'all' || f === 'pending' || f === 'completed' || f === 'completed_email_pending') setFilter(f)
    const v = searchParams.get('view')
    if (v === 'calendar' || v === 'list') setView(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end])

  const sorted = useMemo(() => {
    const base = [...items]
    let filtered = base
    if (filter === 'pending') {
      filtered = base.filter((x) => !x.completed_at)
    } else if (filter === 'completed') {
      filtered = base.filter((x) => !!x.completed_at)
    } else if (filter === 'completed_email_pending') {
      filtered = base.filter((x) => !!x.completed_at && !x.completion_email_sent)
    }
    return filtered.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  }, [items])

  const events = useMemo(() => {
    return sorted
      .filter((s) => !!s.scheduled_date)
      .map((s) => {
        const dt = new Date(s.scheduled_date)
        const pill = s.completed_at ? (
          <Pill tone={s.completion_email_sent ? 'emerald' : 'amber'}>
            {s.completion_email_sent ? 'email sent' : 'email pending'}
          </Pill>
        ) : (
          <Pill tone="teal">scheduled</Pill>
        )
        const ref = s.reference_number || ''
        const who = s.customer_nickname || ''
        const addr = s.install_address || ''
        const titleParts = [ref, who].filter(Boolean)
        const statusPill = s.case_status ? <Pill tone={toneForCaseStatus(s.case_status)}>{s.case_status}</Pill> : null
        return {
          id: `${s.case_id}-${s.scheduled_date}`,
          start: dt,
          href: `/admin/cases/${s.case_id}#installation`,
          tone: s.case_status ? toneForCaseStatus(s.case_status) : 'teal',
          title: (
            <div className="flex flex-wrap items-center gap-2">
              <span>{titleParts.length ? titleParts.join(' · ') : 'Installation'}</span>
              {statusPill}
            </div>
          ),
          subtitle: addr || s.case_id,
          pill,
        }
      })
  }, [sorted])

  function exportCsv() {
    const rows = [
      ['scheduled_date', 'case_id', 'completed_at', 'completion_email_sent', 'notes'],
      ...sorted.map((s) => [
        s.scheduled_date || '',
        s.case_id || '',
        s.completed_at || '',
        s.completion_email_sent ? 'yes' : 'no',
        s.notes || '',
      ]),
    ]
    downloadCsv(`installations-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <AdminShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Installations</h1>
          <div className="mt-1 text-sm text-slate-600">Calendar feed (MVP list view).</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Start</div>
            <input
              type="date"
              value={start.toISOString().slice(0, 10)}
              onChange={(e) => setStart(new Date(e.target.value + 'T00:00:00'))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">End</div>
            <input
              type="date"
              value={end.toISOString().slice(0, 10)}
              onChange={(e) => setEnd(new Date(e.target.value + 'T23:59:59'))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Apply range
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter</div>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton active={filter === 'all'} tone="slate" onClick={() => setFilter('all')}>
              All
            </PillButton>
            <PillButton active={filter === 'pending'} tone="slate" onClick={() => setFilter('pending')}>
              Pending
            </PillButton>
            <PillButton active={filter === 'completed'} tone="emerald" onClick={() => setFilter('completed')}>
              Completed
            </PillButton>
            <PillButton
              active={filter === 'completed_email_pending'}
              tone="amber"
              onClick={() => setFilter('completed_email_pending')}
            >
              Completed, email pending
            </PillButton>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">View</div>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton active={view === 'calendar'} tone="teal" onClick={() => setView('calendar')}>
              Calendar
            </PillButton>
            <PillButton active={view === 'list'} tone="slate" onClick={() => setView('list')}>
              List
            </PillButton>
          </div>
        </div>

        {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}
        {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {view === 'calendar' ? (
          <div className="mt-3">
            <CalendarGrid start={start} end={end} events={events} emptyMessage="No installations in range." />
          </div>
        ) : (
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Case ID</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Completion email</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((s) => (
                  <tr
                    key={s.case_id + s.scheduled_date}
                    className={s.completed_at && !s.completion_email_sent ? 'bg-amber-50' : ''}
                  >
                    <td className="px-3 py-2">{new Date(s.scheduled_date).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="text-teal-700 hover:underline" to={`/admin/cases/${s.case_id}`}>
                        {s.case_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{s.completed_at ? new Date(s.completed_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2">
                      {s.completed_at ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={s.completion_email_sent ? 'emerald' : 'amber'}>
                            {s.completion_email_sent ? 'sent' : 'pending'}
                          </Pill>
                          {!s.completion_email_sent ? (
                            <button
                              type="button"
                              disabled={actionCaseId === s.case_id}
                              onClick={() => sendCompletionEmail(s.case_id)}
                              className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {actionCaseId === s.case_id ? 'Sending…' : 'Send'}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{s.notes || '—'}</td>
                  </tr>
                ))}
                {!loading && sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      No installations in range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  )
}

