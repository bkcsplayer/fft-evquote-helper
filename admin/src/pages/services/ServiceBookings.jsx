import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell.jsx'
import { Pill, PillButton } from '../../components/ui/Pill.jsx'
import { SkeletonTable } from '../../components/ui/Skeleton.jsx'
import { api } from '../../services/api.js'
import { humanizeStatus, toneForServiceBookingStatus } from '../../utils/serviceTone.js'

const STATUSES = ['submitted', 'scheduled', 'survey_scheduled', 'quoted', 'approved', 'in_progress', 'install_scheduled', 'completed', 'cancelled']

export default function ServiceBookings() {
  const [searchParams] = useSearchParams()
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(overrides) {
    const t = overrides?.type ?? type
    const s = overrides?.status ?? status
    setLoading(true); setError('')
    try {
      const res = await api.get('/services/bookings', { params: { type: t || undefined, status: s || undefined } })
      setItems(res.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load bookings') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const t = searchParams.get('type')
    const initType = t === 'diagnostic' || t === 'bird_netting' ? t : ''
    const s = searchParams.get('status')
    const initStatus = STATUSES.includes(s) ? s : ''
    if (initType) setType(initType)
    if (initStatus) setStatus(initStatus)
    load({ type: initType, status: initStatus })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Service Bookings</h1>
            <p className="mt-1 text-sm text-slate-500">Diagnostic + bird-netting requests.</p>
          </div>
          <button type="button" onClick={() => load()} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Service:</span>
            <PillButton active={type === ''} tone="slate" onClick={() => { setType(''); load({ type: '' }) }}>All</PillButton>
            <PillButton active={type === 'diagnostic'} tone="amber" onClick={() => { setType('diagnostic'); load({ type: 'diagnostic' }) }}>Diagnostic</PillButton>
            <PillButton active={type === 'bird_netting'} tone="teal" onClick={() => { setType('bird_netting'); load({ type: 'bird_netting' }) }}>Bird Netting</PillButton>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status:</span>
            <PillButton active={status === ''} tone="slate" onClick={() => { setStatus(''); load({ status: '' }) }}>All</PillButton>
            {STATUSES.map((s) => (
              <PillButton key={s} active={status === s} tone={toneForServiceBookingStatus(s)} onClick={() => { setStatus(s); load({ status: s }) }}>
                {humanizeStatus(s)}
              </PillButton>
            ))}
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div> : null}

        <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
          {loading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Scheduled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-semibold">
                        <Link className="text-emerald-600 transition-colors hover:text-emerald-700 hover:underline" to={`/admin/services/bookings/${b.id}`}>
                          {b.reference_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={b.service_type === 'diagnostic' ? 'amber' : 'teal'}>
                          {b.service_type === 'diagnostic' ? 'Diagnostic' : 'Bird Netting'}
                        </Pill>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.customer_name}</div>
                        <div className="text-xs text-slate-500">{b.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={toneForServiceBookingStatus(b.status)}>{humanizeStatus(b.status)}</Pill>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No bookings found.</td></tr>
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
