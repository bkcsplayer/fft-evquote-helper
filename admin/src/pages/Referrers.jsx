import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'

export default function Referrers() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { const res = await api.get('/referrers/stats'); setItems(res.data || []) }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to load referrers stats') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Referrers</h1>
            <p className="mt-1 text-sm text-slate-500">Lead & conversion stats.</p>
          </div>
          <button type="button" onClick={load} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
            Refresh
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">
          {loading ? (
            <div className="p-4"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>
          ) : error ? (
            <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Referrer</th>
                    <th className="px-4 py-3">Leads</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <tr key={r.referrer} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.referrer}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{r.leads}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{r.completed}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${(r.conversion_rate || 0) > 0.3 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {Math.round((r.conversion_rate || 0) * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!loading && items.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">No referrers yet.</td></tr>
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
