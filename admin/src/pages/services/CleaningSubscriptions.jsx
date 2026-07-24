import { Fragment, useEffect, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell.jsx'
import { Pill, PillButton } from '../../components/ui/Pill.jsx'
import { SkeletonTable } from '../../components/ui/Skeleton.jsx'
import { AdminSlotPicker } from '../../components/services/AdminSlotPicker.jsx'
import { api } from '../../services/api.js'
import { toneForCleaningVisitStatus } from '../../utils/serviceTone.js'

const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded']
const VISIT_STATUSES = ['pending', 'notified', 'completed', 'skipped']

const btn = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-95 disabled:opacity-60'
const btnP = 'inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 active:scale-95 disabled:opacity-60'
const input = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

function money(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

export default function CleaningSubscriptions() {
  const [paymentFilter, setPaymentFilter] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  async function load(overrides) {
    const p = overrides?.payment ?? paymentFilter
    setLoading(true); setError('')
    try {
      const res = await api.get('/services/cleaning', { params: { payment_status: p || undefined } })
      setItems(res.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load subscriptions') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function patchItem(next) {
    setItems((prev) => prev.map((s) => (s.id === next.id ? next : s)))
  }

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Cleaning Subscriptions</h1>
            <p className="mt-1 text-sm text-slate-500">Annual subscriptions, 4 quarterly visits each.</p>
          </div>
          <button type="button" onClick={() => load()} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment:</span>
            <PillButton active={paymentFilter === ''} tone="slate" onClick={() => { setPaymentFilter(''); load({ payment: '' }) }}>All</PillButton>
            {PAYMENT_STATUSES.map((p) => (
              <PillButton key={p} active={paymentFilter === p} tone={p === 'paid' ? 'emerald' : p === 'refunded' ? 'rose' : 'slate'} onClick={() => { setPaymentFilter(p); load({ payment: p }) }}>
                {p}
              </PillButton>
            ))}
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div> : null}

        <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
          {loading ? (
            <SkeletonTable rows={6} cols={5} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Annual price</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((s) => (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedId((prev) => (prev === s.id ? null : s.id))}
                        className="cursor-pointer transition-colors hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3 font-semibold text-emerald-700">{s.reference_number}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{s.customer_name}</div>
                          <div className="text-xs text-slate-500">{s.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={s.tier === 'custom' ? 'amber' : 'slate'}>{s.tier}</Pill>
                        </td>
                        <td className="px-4 py-3">
                          {s.pricing_status === 'pending_quote' ? <Pill tone="amber">pending quote</Pill> : money(s.annual_price)}
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={s.payment_status === 'paid' ? 'emerald' : s.payment_status === 'refunded' ? 'rose' : 'slate'}>{s.payment_status}</Pill>
                        </td>
                      </tr>
                      {expandedId === s.id ? (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/60 px-4 py-4">
                            <SubscriptionPanel sub={s} onChange={patchItem} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No subscriptions found.</td></tr>
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

function SubscriptionPanel({ sub, onChange }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [priceInput, setPriceInput] = useState(sub.annual_price != null ? String(sub.annual_price) : '')

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function setPayment(payment_status) {
    setBusy(true)
    try { const r = await api.post(`/services/cleaning/${sub.id}/payment`, { payment_status }); onChange(r.data); flash('Payment updated.') }
    catch (e) { flash(e?.response?.data?.detail || 'Failed') }
    finally { setBusy(false) }
  }

  async function setPrice() {
    if (!priceInput) return
    setBusy(true)
    try { const r = await api.post(`/services/cleaning/${sub.id}/price`, { annual_price: Number(priceInput) }); onChange(r.data); flash('Price set.') }
    catch (e) { flash(e?.response?.data?.detail || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">{sub.address} · {sub.panel_count} panels</div>
        {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{msg}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {sub.pricing_status === 'pending_quote' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Set annual price</span>
            <input value={priceInput} onChange={(e) => setPriceInput(e.target.value.replace(/[^\d.]/g, ''))} className={`${input} w-28`} placeholder="e.g. 999.00" />
            <button type="button" disabled={busy} onClick={setPrice} className={btnP}>Save price</button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Payment:</span>
          {PAYMENT_STATUSES.map((p) => (
            <PillButton key={p} active={sub.payment_status === p} tone={p === 'paid' ? 'emerald' : p === 'refunded' ? 'rose' : 'slate'} onClick={() => setPayment(p)}>
              {p}
            </PillButton>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sub.visits.map((v) => (
          <VisitCard key={v.id} visit={v} onChange={(nextSub) => onChange(nextSub)} />
        ))}
      </div>
    </div>
  )
}

function VisitCard({ visit, onChange }) {
  const [busy, setBusy] = useState(false)
  const [slot, setSlot] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [notes, setNotes] = useState(visit.notes || '')
  const [statusPick, setStatusPick] = useState(visit.status)

  async function schedule() {
    if (!slot) return
    setBusy(true)
    try {
      const r = await api.post(`/services/cleaning/visits/${visit.id}/schedule`, { start_at: slot })
      onChange(r.data)
      setShowPicker(false)
      setSlot(null)
    } catch { /* surfaced via parent reload if needed */ }
    finally { setBusy(false) }
  }

  async function updateStatus() {
    setBusy(true)
    try {
      const r = await api.post(`/services/cleaning/visits/${visit.id}/status`, { status: statusPick, notes: notes.trim() || undefined })
      onChange(r.data)
    } catch { /* ignore, panel stays as-is */ }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Q{visit.quarter}</div>
        <Pill tone={toneForCleaningVisitStatus(visit.status)}>{visit.status}</Pill>
      </div>
      <div className="mt-1 text-xs text-slate-600">
        {visit.scheduled_date ? new Date(visit.scheduled_date).toLocaleString() : 'Not scheduled'}
      </div>

      {showPicker ? (
        <div className="mt-2">
          <AdminSlotPicker value={slot} onChange={setSlot} />
          <div className="mt-2 flex gap-1.5">
            <button type="button" disabled={busy || !slot} onClick={schedule} className={btnP}>Confirm</button>
            <button type="button" onClick={() => setShowPicker(false)} className={btn}>Close</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowPicker(true)} className={`${btn} mt-2 w-full justify-center`}>Schedule</button>
      )}

      <div className="mt-2 space-y-1.5 border-t pt-2">
        <select value={statusPick} onChange={(e) => setStatusPick(e.target.value)} className={`${input} w-full`}>
          {VISIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${input} w-full`} placeholder="Notes (optional)" />
        <button type="button" disabled={busy} onClick={updateStatus} className={`${btn} w-full justify-center`}>Save</button>
      </div>
    </div>
  )
}
