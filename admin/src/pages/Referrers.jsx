import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'

export default function Referrers() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/referrers/stats')
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load referrers stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <AdminShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Referrers</h1>
          <div className="mt-1 text-sm text-slate-600">Lead & conversion stats.</div>
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
        {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}
        {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Referrer</th>
                <th className="px-3 py-2">Leads</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((r) => (
                <tr key={r.referrer}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{r.referrer}</td>
                  <td className="px-3 py-2">{r.leads}</td>
                  <td className="px-3 py-2">{r.completed}</td>
                  <td className="px-3 py-2">{Math.round((r.conversion_rate || 0) * 100)}%</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                    No referrers yet.
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

