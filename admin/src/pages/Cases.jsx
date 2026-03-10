import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function rowBgForStatus(status) {
  switch (toneForCaseStatus(status)) {
    case 'teal':
      return 'bg-teal-50'
    case 'amber':
      return 'bg-amber-50'
    case 'emerald':
      return 'bg-emerald-50'
    case 'rose':
      return 'bg-rose-50'
    case 'indigo':
      return 'bg-indigo-50'
    default:
      return ''
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

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cases</h1>
          <div className="mt-1 text-sm text-slate-600">Track cases across the full lifecycle.</div>
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
              placeholder="Name / phone / address / reference"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
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

        {loading ? <div className="mt-4 text-sm text-slate-600">Loading…</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => (
                <tr key={it.id} className={`hover:bg-slate-100 ${rowBgForStatus(it.status)}`}>
                  <td className="px-3 py-2 font-semibold">
                    <Link className="text-teal-700 hover:underline" to={`/admin/cases/${it.id}`}>
                      {it.reference_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{it.customer_nickname}</div>
                    <div className="text-xs text-slate-500">{it.phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={toneForCaseStatus(it.status)}>{it.status}</Pill>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{it.install_address}</td>
                  <td className="px-3 py-2 text-slate-600">{new Date(it.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                    No cases found.
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

