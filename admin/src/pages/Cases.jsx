import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
import { SkeletonTable } from '../components/ui/Skeleton.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function rowBgForStatus(status) {
  switch (toneForCaseStatus(status)) {
    case 'teal': return 'bg-teal-50/30'
    case 'amber': return 'bg-amber-50/30'
    case 'emerald': return 'bg-emerald-50/20'
    case 'rose': return 'bg-rose-50/20'
    default: return ''
  }
}

export default function Cases() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/cases', { params: { q: q || undefined, status: status || undefined } })
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load cases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Cases</h1>
            <p className="mt-1 text-sm text-slate-500">Track cases across the full lifecycle.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                placeholder="Name / phone / address / reference"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">All</option>
                <option value="pending">pending</option>
                <option value="survey_scheduled">survey_scheduled</option>
                <option value="survey_completed">survey_completed</option>
                <option value="quoting">quoting</option>
                <option value="quoted">quoted</option>
                <option value="customer_approved">customer_approved</option>
                <option value="permit_applied">permit_applied</option>
                <option value="permit_approved">permit_approved</option>
                <option value="installation_scheduled">installation_scheduled</option>
                <option value="installed">installed</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => { setQ(''); setStatus(''); setTimeout(load, 0) }}
                className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
        ) : null}

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          {loading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => (
                    <tr key={it.id} className={`transition-colors hover:bg-slate-50 ${rowBgForStatus(it.status)}`}>
                      <td className="px-4 py-3 font-semibold">
                        <Link className="text-sky-600 transition-colors hover:text-sky-700 hover:underline" to={`/admin/cases/${it.id}`}>
                          {it.reference_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{it.customer_nickname}</div>
                        <div className="text-xs text-slate-500">{it.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={toneForCaseStatus(it.status)}>{it.status}</Pill>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{it.install_address}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(it.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium text-slate-500">No cases found.</p>
                        <p className="mt-1 text-xs text-slate-400">Try adjusting your search or filter.</p>
                      </td>
                    </tr>
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
