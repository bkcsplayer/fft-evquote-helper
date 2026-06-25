import { useEffect, useState } from 'react'
import { api } from '../../services/api.js'
import { Card, SectionHeader } from '../../components/ui/Card.jsx'
import { Pill } from '../../components/ui/Pill.jsx'

function money(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

const KIND_TONE = { deposit: 'teal', balance: 'emerald', refund: 'rose' }
const STATUS_TONE = { pending: 'amber', received: 'emerald', refunded: 'rose' }

function Stat({ label, value, tone = 'slate' }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

export default function FinanceTab({ caseId }) {
  const [fin, setFin] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('deposit')
  const [method, setMethod] = useState('etransfer')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  async function load() {
    setError('')
    try {
      const [f, p] = await Promise.all([
        api.get(`/cases/${caseId}/financials`),
        api.get(`/cases/${caseId}/payments`),
      ])
      setFin(f.data); setPayments(p.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load financials') }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  async function addPayment(status) {
    if (!amount) return
    setBusy(true); setError('')
    try {
      await api.post(`/cases/${caseId}/payments`, {
        kind, method, amount: Number(amount), status, reference: reference.trim() || null,
      })
      setAmount(''); setReference('')
      await load()
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to add payment') }
    finally { setBusy(false) }
  }

  async function setStatus(id, status) {
    setBusy(true); setError('')
    try { await api.patch(`/payments/${id}`, { status }); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to update payment') }
    finally { setBusy(false) }
  }

  const marginTone = fin?.margin == null ? 'slate' : fin.margin >= 0 ? 'emerald' : 'rose'

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionHeader eyebrow="Financials" title="Per-case profit & loss" />
        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div> : null}
        {fin ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Contract total" value={money(fin.contract_total)} />
              <Stat label="Revenue (ex-GST)" value={money(fin.revenue_ex_gst)} />
              <Stat label="BOM cost" value={money(fin.cost)} />
              <Stat label="Margin" value={`${money(fin.margin)} · ${fin.margin_pct ?? '—'}%`} tone={marginTone} />
              <Stat label="Received" value={money(fin.total_received)} tone="emerald" />
              <Stat label="Balance due" value={money(fin.balance_due)} tone={fin.balance_due > 0 ? 'rose' : 'emerald'} />
            </div>
            {!fin.has_quote ? <p className="mt-3 text-xs text-slate-400">No active quote yet — revenue is 0 until a quote is created.</p> : null}
            {fin.bom_line_count === 0 ? <p className="mt-1 text-xs text-slate-400">No BOM lines yet — cost is 0. Add materials in the BOM tab.</p> : null}
          </>
        ) : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100" />
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader eyebrow="Payment ledger" title="Deposits, balance & refunds" />
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="deposit">deposit</option><option value="balance">balance</option><option value="refund">refund</option>
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="etransfer">etransfer</option><option value="cash">cash</option><option value="stripe">stripe</option><option value="other">other</option>
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Amount" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !amount} onClick={() => addPayment('received')} className="flex-1 cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">Add received</button>
            <button type="button" disabled={busy || !amount} onClick={() => addPayment('pending')} className="cursor-pointer rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Pending</button>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5">When</th><th className="px-3 py-2.5">Kind</th><th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Amount</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5"><Pill tone={KIND_TONE[p.kind] || 'slate'}>{p.kind}</Pill></td>
                  <td className="px-3 py-2.5 text-slate-600">{p.method}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900">{money(p.amount)}</td>
                  <td className="px-3 py-2.5"><Pill tone={STATUS_TONE[p.status] || 'slate'}>{p.status}</Pill></td>
                  <td className="px-3 py-2.5">
                    {p.status === 'pending' ? (
                      <button type="button" disabled={busy} onClick={() => setStatus(p.id, 'received')} className="cursor-pointer rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">Confirm received</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No payments recorded.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
