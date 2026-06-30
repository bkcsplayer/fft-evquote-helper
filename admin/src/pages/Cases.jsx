import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { StatusTag } from '../components/ui/StatusTag.jsx'
import { SkeletonTable } from '../components/ui/Skeleton.jsx'
import { CASE_STATUS_ORDER, statusLabel, toneForCaseStatus } from '../utils/caseStatus.js'
import { borderLeftClass, rowTintClass } from '../utils/tone.js'

export default function Cases() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Accept explicit overrides so callers (Clear button, URL drill-through) never read stale
  // closure state from a render that happened before setState batched.
  async function load(overrides) {
    const qVal = overrides?.q ?? q
    const statusVal = overrides?.status ?? status
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/cases', { params: { q: qVal || undefined, status: statusVal || undefined } })
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load cases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Drill-through: honor ?status= / ?q= from Dashboard links on first load.
    const st = searchParams.get('status')
    const qq = searchParams.get('q')
    const initStatus = st && CASE_STATUS_ORDER.includes(st) ? st : ''
    const initQ = qq || ''
    if (initStatus) setStatus(initStatus)
    if (initQ) setQ(initQ)
    load({ q: initQ, status: initStatus })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            className="cursor-pointer rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load() }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Name / phone / address / reference"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1.5 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">All statuses</option>
                {CASE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => { setQ(''); setStatus(''); load({ q: '', status: '' }) }}
                className="inline-flex cursor-pointer items-center justify-center rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
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
        <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
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
                  {items.map((it) => {
                    const tone = toneForCaseStatus(it.status)
                    return (
                      <tr key={it.id} className={`group transition-colors hover:bg-slate-50/80 ${rowTintClass(tone)}`}>
                        <td className={`border-l-4 ${borderLeftClass(tone)} px-4 py-3 font-semibold`}>
                          <Link className="text-emerald-600 transition-colors hover:text-emerald-700 hover:underline" to={`/admin/cases/${it.id}`}>
                            {it.reference_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{it.customer_nickname}</div>
                          <div className="text-xs text-slate-500">{it.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusTag status={it.status} />
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{it.install_address}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(it.created_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                  {items.length === 0 && (
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
