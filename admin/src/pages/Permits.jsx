import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { downloadCsv } from '../components/ui/csv.js'
import { PillButton } from '../components/ui/Pill.jsx'
import { StatusTag, PermitStatusTag } from '../components/ui/StatusTag.jsx'
import { toneForPermitStatus } from '../utils/caseStatus.js'
import { borderLeftClass, rowTintClass } from '../utils/tone.js'

const PERMIT_STATUSES = ['applied', 'approved', 'revision_required']

export default function Permits() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [rowBusy, setRowBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('all')

  // Overrides prevent reading stale closure state (Clear button, URL drill-through).
  async function load(overrides) {
    const qVal = overrides?.q ?? q
    const statusVal = overrides?.status ?? status
    setLoading(true); setError('')
    try {
      const res = await api.get('/permits', { params: { q: qVal || undefined, status: statusVal || undefined } })
      setItems((res.data || []).map((it) => ({ ...it, _edit_status: it.status })))
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load permits') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const qq = searchParams.get('q'); const st = searchParams.get('status'); const qu = searchParams.get('quick')
    const initQ = typeof qq === 'string' && qq ? qq : ''
    const initStatus = PERMIT_STATUSES.includes(st) ? st : ''
    if (initQ) setQ(initQ)
    if (initStatus) setStatus(initStatus)
    if (qu === 'all' || qu === 'needs_action') setQuick(qu)
    load({ q: initQ, status: initStatus })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function exportCsv() {
    const visible = quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items
    const rows = [
      ['reference_number', 'case_id', 'customer_nickname', 'case_status', 'permit_number', 'permit_status', 'applied_date', 'expected_approval_date', 'actual_approval_date', 'install_address'],
      ...visible.map((it) => [it.reference_number || '', it.case_id || '', it.customer_nickname || '', it.case_status || '', it.permit_number || '', it.status || '', it.applied_date || '', it.expected_approval_date || '', it.actual_approval_date || '', it.install_address || '']),
    ]
    downloadCsv(`permits-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  async function saveStatus(it) {
    setRowBusy((m) => ({ ...m, [it.id]: true })); setError('')
    try {
      await api.patch(`/permits/${it.id}/status`, { status: it._edit_status || it.status, note: 'Updated by admin' })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to update permit status')
    } finally {
      setRowBusy((m) => ({ ...m, [it.id]: false }))
    }
  }

  const visibleItems = quick === 'needs_action' ? items.filter((x) => x.status === 'revision_required') : items

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Permits</h1>
            <p className="mt-1 text-sm text-slate-500">Permit tracking & attachments. Rows are colored by permit status.</p>
          </div>
          <button type="button" onClick={load} className="cursor-pointer rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load() }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" placeholder="Reference / address / customer / permit #" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Permit status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1.5 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20">
                <option value="">All</option>
                {PERMIT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={load} className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800">Apply</button>
              <button type="button" onClick={() => { setQ(''); setStatus(''); load({ q: '', status: '' }) }} className="inline-flex cursor-pointer items-center justify-center rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">Clear</button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick:</span>
            <PillButton active={quick === 'all'} tone="slate" onClick={() => setQuick('all')}>All</PillButton>
            <PillButton active={quick === 'needs_action'} tone="amber" onClick={() => setQuick('needs_action')}>Needs action</PillButton>
            <button type="button" onClick={exportCsv} className="cursor-pointer rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50">Export CSV</button>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Permit #</th>
                  <th className="px-3 py-3">Permit status</th>
                  <th className="px-3 py-3">Dates</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-3 py-3"><div className="h-6 animate-pulse rounded bg-slate-100" /></td>
                    </tr>
                  ))
                ) : (
                  visibleItems.map((it) => {
                    const tone = toneForPermitStatus(it.status)
                    const dirty = (it._edit_status || it.status) !== it.status
                    return (
                      <tr key={it.id} className={`transition-colors hover:bg-slate-50/80 ${rowTintClass(tone)}`}>
                        <td className={`border-l-4 ${borderLeftClass(tone)} px-3 py-3 align-top`}>
                          <Link className="font-semibold text-sky-600 hover:underline" to={`/admin/cases/${it.case_id}`}>{it.reference_number}</Link>
                          <div className="mt-1"><StatusTag status={it.case_status} /></div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-slate-900">{it.customer_nickname}</div>
                          <div className="mt-0.5 max-w-[200px] truncate text-xs text-slate-500">{it.install_address}</div>
                        </td>
                        <td className="px-3 py-3 align-top font-semibold text-slate-900">{it.permit_number || '—'}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col gap-1.5">
                            <select
                              value={it._edit_status || it.status || 'applied'}
                              onChange={(e) => { const v = e.target.value; setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, _edit_status: v } : x))) }}
                              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            >
                              {PERMIT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                            <PermitStatusTag status={it._edit_status || it.status} />
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-600">
                          <div>Applied: <span className="text-slate-800">{it.applied_date || '—'}</span></div>
                          <div>Expected: <span className="text-slate-800">{it.expected_approval_date || '—'}</span></div>
                          <div>Approved: <span className="text-slate-800">{it.actual_approval_date || '—'}</span></div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={rowBusy[it.id] || !dirty}
                              onClick={() => saveStatus(it)}
                              className="cursor-pointer rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Save and notify customer by SMS/email"
                            >
                              {rowBusy[it.id] ? 'Saving…' : 'Save & notify'}
                            </button>
                            <Link className="cursor-pointer rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50" to={`/admin/cases/${it.case_id}#permit`}>Open</Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
                {!loading && visibleItems.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">No permits found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
