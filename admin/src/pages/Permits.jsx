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
    case 'teal': return 'bg-teal-50/30'
    case 'amber': return 'bg-amber-50/30'
    case 'emerald': return 'bg-emerald-50/20'
    case 'rose': return 'bg-rose-50/20'
    case 'indigo': return 'bg-indigo-50/20'
    default: return ''
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
  const [quick, setQuick] = useState('all')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get('/permits', { params: { q: q || undefined, status: status || undefined } })
      setItems((res.data || []).map((it) => ({ ...it, _edit_status: it.status })))
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load permits') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const qq = searchParams.get('q'); const st = searchParams.get('status'); const qu = searchParams.get('quick')
    if (typeof qq === 'string' && qq) setQ(qq)
    if (st === '' || st === 'applied' || st === 'approved' || st === 'revision_required') setStatus(st || '')
    if (qu === 'all' || qu === 'needs_action') setQuick(qu)
    load()
  }, [])

  function exportCsv() {
    const visible = quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items
    const rows = [
      ['reference_number', 'case_id', 'customer_nickname', 'case_status', 'permit_number', 'permit_status', 'applied_date', 'expected_approval_date', 'actual_approval_date', 'install_address'],
      ...visible.map((it) => [it.reference_number || '', it.case_id || '', it.customer_nickname || '', it.case_status || '', it.permit_number || '', it.status || '', it.applied_date || '', it.expected_approval_date || '', it.actual_approval_date || '', it.install_address || '']),
    ]
    downloadCsv(`permits-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Permits</h1>
            <p className="mt-1 text-sm text-slate-500">Permit tracking & attachments.</p>
          </div>
          <button type="button" onClick={load} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" placeholder="Reference / address / customer / permit #" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Permit status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20">
                <option value="">All</option>
                <option value="applied">applied</option>
                <option value="approved">approved</option>
                <option value="revision_required">revision_required</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={load} className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95">Apply</button>
              <button type="button" onClick={() => { setQ(''); setStatus(''); setTimeout(load, 0) }} className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">Clear</button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick:</span>
            <PillButton active={quick === 'all'} tone="slate" onClick={() => setQuick('all')}>All</PillButton>
            <PillButton active={quick === 'needs_action'} tone="amber" onClick={() => setQuick('needs_action')}>Needs action</PillButton>
            <button type="button" onClick={exportCsv} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50">Export CSV</button>
            <span className="text-xs text-slate-400">Revision required highlighted.</span>
          </div>

          {loading && <div className="mt-4"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>}
          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          {quick === 'needs_action' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
              Showing permits that need action (revision required).
            </div>
          )}

          <div className="mt-4 overflow-auto rounded-xl border">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Case status</th>
                  <th className="px-3 py-3">Permit #</th>
                  <th className="px-3 py-3">Permit status</th>
                  <th className="px-3 py-3">Actions</th>
                  <th className="px-3 py-3">Dates</th>
                  <th className="px-3 py-3">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items).map((it) => (
                  <tr key={it.id} className={`transition-colors hover:bg-slate-50 ${rowBgForCaseStatus(it.case_status)} ${it.status === 'revision_required' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-3 font-semibold">
                      <Link className="text-sky-600 hover:underline" to={`/admin/cases/${it.case_id}`}>{it.reference_number}</Link>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{it.customer_nickname}</td>
                    <td className="px-3 py-3"><Pill tone={toneForCaseStatus(it.case_status)}>{it.case_status}</Pill></td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{it.permit_number || '—'}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{it.id}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={it._edit_status || it.status || 'applied'}
                          onChange={(e) => { const v = e.target.value; setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, _edit_status: v } : x))) }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
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
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={rowBusy[it.id] || (it._edit_status || it.status) === it.status}
                          onClick={async () => {
                            setRowBusy((m) => ({ ...m, [it.id]: true })); setError('')
                            try { await api.patch(`/permits/${it.id}/status`, { status: it._edit_status || it.status, note: 'Updated by admin' }); await load() }
                            catch (e) { setError(e?.response?.data?.detail || 'Failed to update permit status') }
                            finally { setRowBusy((m) => ({ ...m, [it.id]: false })) }
                          }}
                          className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60"
                          title="Save and notify customer"
                        >
                          Save & notify
                        </button>
                        <Link className="rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50" to={`/admin/cases/${it.case_id}#permit`}>Open</Link>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <div>Applied: {it.applied_date || '—'}</div>
                      <div>Expected: {it.expected_approval_date || '—'}</div>
                      <div>Approved: {it.actual_approval_date || '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate">{it.install_address}</td>
                  </tr>
                ))}
                {!loading && (quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required').length === 0 : items.length === 0) && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">No permits found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
