import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { downloadCsv } from '../components/ui/csv.js'
import { Pill, PillButton } from '../components/ui/Pill.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function rowBgForCaseStatus(caseStatus) {
  const tone = toneForCaseStatus(caseStatus)
  switch (tone) {
    case 'teal':
      return 'bg-teal-50/50'
    case 'amber':
      return 'bg-amber-50/50'
    case 'emerald':
      return 'bg-emerald-50/45'
    case 'rose':
      return 'bg-rose-50/45'
    case 'indigo':
      return 'bg-indigo-50/45'
    default:
      return ''
  }
}

export default function Permits() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [rowBusy, setRowBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('all') // all | needs_action

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/permits', { params: { q: q || undefined, status: status || undefined } })
      const rows = (res.data || []).map((it) => ({ ...it, _edit_status: it.status }))
      setItems(rows)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load permits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const qq = searchParams.get('q')
    const st = searchParams.get('status')
    const qu = searchParams.get('quick')
    if (typeof qq === 'string' && qq) setQ(qq)
    if (st === '' || st === 'applied' || st === 'approved' || st === 'revision_required') setStatus(st || '')
    if (qu === 'all' || qu === 'needs_action') setQuick(qu)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function exportCsv() {
    const visible = quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items
    const rows = [
      [
        'reference_number',
        'case_id',
        'customer_nickname',
        'case_status',
        'permit_number',
        'permit_status',
        'applied_date',
        'expected_approval_date',
        'actual_approval_date',
        'install_address',
      ],
      ...visible.map((it) => [
        it.reference_number || '',
        it.case_id || '',
        it.customer_nickname || '',
        it.case_status || '',
        it.permit_number || '',
        it.status || '',
        it.applied_date || '',
        it.expected_approval_date || '',
        it.actual_approval_date || '',
        it.install_address || '',
      ]),
    ]
    downloadCsv(`permits-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <AdminShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Permits</h1>
          <div className="mt-1 text-sm text-slate-600">Permit tracking & attachments.</div>
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
            <div className="text-sm font-medium text-slate-800">Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="Reference / address / customer / permit #"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Permit status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="">All</option>
              <option value="applied">applied</option>
              <option value="approved">approved</option>
              <option value="revision_required">revision_required</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              className="mt-6 inline-flex flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setQ('')
                setStatus('')
                setTimeout(load, 0)
              }}
              className="mt-6 inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick</div>
          <PillButton active={quick === 'all'} tone="slate" onClick={() => setQuick('all')}>
            All
          </PillButton>
          <PillButton active={quick === 'needs_action'} tone="amber" onClick={() => setQuick('needs_action')}>
            Needs action
          </PillButton>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
          <div className="text-xs text-slate-500">Revision required highlighted.</div>
        </div>

        {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}
        {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {quick === 'needs_action' ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Showing permits that need action (revision required).
          </div>
        ) : null}

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Case status</th>
                <th className="px-3 py-2">Permit #</th>
                <th className="px-3 py-2">Permit status</th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items).map((it) => (
                <tr
                  key={it.id}
                  className={`hover:bg-slate-100 ${rowBgForCaseStatus(it.case_status)} ${
                    it.status === 'revision_required' ? 'bg-amber-50' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-semibold">
                    <Link className="text-teal-700 hover:underline" to={`/admin/cases/${it.case_id}`}>
                      {it.reference_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{it.customer_nickname}</td>
                  <td className="px-3 py-2">
                    <Pill tone={toneForCaseStatus(it.case_status)}>{it.case_status}</Pill>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{it.permit_number || '—'}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{it.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={it._edit_status || it.status || 'applied'}
                        onChange={(e) => {
                          const v = e.target.value
                          setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, _edit_status: v } : x)))
                        }}
                        className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="applied">applied</option>
                        <option value="approved">approved</option>
                        <option value="revision_required">revision_required</option>
                      </select>
                      <Pill tone={it._edit_status === 'revision_required' ? 'amber' : it._edit_status === 'approved' ? 'emerald' : 'slate'}>
                        {it._edit_status || it.status}
                      </Pill>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={rowBusy[it.id] || (it._edit_status || it.status) === it.status}
                        onClick={async () => {
                          setRowBusy((m) => ({ ...m, [it.id]: true }))
                          setError('')
                          try {
                            await api.patch(`/permits/${it.id}/status`, { status: it._edit_status || it.status, note: 'Updated by admin' })
                            await load()
                          } catch (e) {
                            setError(e?.response?.data?.detail || 'Failed to update permit status')
                          } finally {
                            setRowBusy((m) => ({ ...m, [it.id]: false }))
                          }
                        }}
                        className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        title="Save and notify customer"
                      >
                        Save & notify
                      </button>
                      <Link
                        className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        to={`/admin/cases/${it.case_id}#permit`}
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    <div>Applied: {it.applied_date || '—'}</div>
                    <div>Expected: {it.expected_approval_date || '—'}</div>
                    <div>Approved: {it.actual_approval_date || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{it.install_address}</td>
                </tr>
              ))}
              {!loading && (quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required').length === 0 : items.length === 0) ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                    No permits found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}

