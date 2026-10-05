import { useEffect, useRef, useState } from 'react'
import { api } from '../../../services/api.js'
import { estimateBirdQuote, money } from '../../../utils/birdMoney.js'
import { SendQuoteDialog } from './SendQuoteDialog.jsx'

const num = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
const btn = 'cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
const row = 'flex justify-between px-3 py-2'
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`

// Stage ② — quote draft: save / preview / send (UI contract v1 lines 136–175).
export function QuoteDraftCard({ b, reload }) {
  const q = b.quote
  const suggested = b.survey?.suggested_rolls ?? 0
  const [rolls, setRolls] = useState(String(q ? q.roll_count : suggested))
  const [nests, setNests] = useState(String(q ? q.nest_count : (b.survey?.nest_count ?? 0)))
  const [reason, setReason] = useState(q?.roll_override_reason || '')
  const [prices, setPrices] = useState(q ? { roll: q.roll_price, nest: q.nest_fee } : null)
  const [saving, setSaving] = useState(false)
  const [reasonErr, setReasonErr] = useState('')
  const [msg, setMsg] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const sendBtnRef = useRef(null)

  useEffect(() => {
    if (q) return
    let on = true
    api.get('/services/pricing')
      .then((r) => on && setPrices({ roll: r.data.bird_netting_roll_price, nest: r.data.bird_netting_nest_fee }))
      .catch(() => on && setMsg('Could not load prices.'))
    return () => { on = false }
  }, [q])

  const rollsDiffer = Number(rolls) !== suggested
  const dirty = !q
    || Number(rolls) !== q.roll_count
    || Number(nests) !== q.nest_count
    || (rollsDiffer && (reason.trim() || null) !== (q.roll_override_reason || null))

  const est = prices ? estimateBirdQuote(rolls || 0, nests || 0, prices.roll, prices.nest) : null
  const shown = !dirty
    ? { subtotal: q.subtotal, gst: q.gst_amount, total: q.total, deposit: q.deposit_amount }
    : est
  const rollPrice = !dirty ? q.roll_price : prices?.roll
  const nestFee = !dirty ? q.nest_fee : prices?.nest

  async function saveDraft() {
    setMsg(''); setReasonErr('')
    if (rollsDiffer && !reason.trim()) {
      setReasonErr(`Explain why the roll count differs from the suggested ${suggested}.`)
      return
    }
    setSaving(true)
    try {
      await api.put(`/services/bookings/${b.id}/quote-draft`, {
        roll_count: Number(rolls), nest_count: Number(nests), roll_override_reason: reason.trim() || null,
      })
      await reload()
      setMsg('Draft saved.')
    } catch (e) {
      setReasonErr(e?.response?.data?.detail || 'Failed to save the draft.')
    } finally { setSaving(false) }
  }

  function closeDialog() {
    setDialogOpen(false)
    setTimeout(() => sendBtnRef.current?.focus(), 0)
  }

  async function onSent() {
    setDialogOpen(false)
    await reload()
  }

  const locked = !q || dirty || saving

  return (
    <section className="rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current step · 2 of 6</div>
          <h2 className="mt-1 text-lg font-bold">Quote draft</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Draft · not sent</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Rolls (100 ft each)</span>
          <input type="number" min="0" step="1" value={rolls} onChange={(e) => setRolls(e.target.value)} className={num} />
          <span className="mt-1 block text-xs text-slate-500">Suggested <b>{suggested}</b> = ⌈{b.survey?.perimeter_ft} ft ÷ 100⌉</span></label>
        <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Nests to clear</span>
          <input type="number" min="0" step="1" value={nests} onChange={(e) => setNests(e.target.value)} className={num} />
          <span className="mt-1 block text-xs text-slate-500">From survey: {b.survey?.nest_count}</span></label>
      </div>
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <label>
          If rolls ≠ suggested, a reason is required:
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. extra roll for split arrays"
            aria-invalid={reasonErr ? 'true' : undefined}
            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-slate-900" />
        </label>
        {reasonErr ? <p role="alert" className="mt-1 font-semibold text-rose-700">{reasonErr}</p> : null}
      </div>

      {shown ? (
        <>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            <div className={row}><span className="text-slate-600">{plural(rolls || 0, 'roll')} × {money(rollPrice)}</span><span>{money((Number(rolls) || 0) * rollPrice)}</span></div>
            <div className={row}><span className="text-slate-600">{plural(nests || 0, 'nest')} × {money(nestFee)}</span><span>{money((Number(nests) || 0) * nestFee)}</span></div>
            <div className={row}><span className="text-slate-600">Subtotal</span><span>{money(shown.subtotal)}</span></div>
            <div className={row}><span className="text-slate-600">GST 5%</span><span>{money(shown.gst)}</span></div>
            <div className={`${row} bg-slate-50 font-bold`}><span>Total</span><span>{money(shown.total)}</span></div>
            <div className={`${row} text-slate-600`}><span>Deposit on approval (30%)</span><span>{money(shown.deposit)}</span></div>
          </div>
          {dirty ? <p className="mt-1 text-xs font-medium text-amber-800">Estimate — save to confirm</p> : null}
        </>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={saving} onClick={saveDraft} className={btn}>{saving ? 'Saving…' : 'Save draft'}</button>
        <button type="button" disabled={locked} onClick={() => window.open(q.preview_url, '_blank', 'noopener')} className={btn}>Preview customer page</button>
        <button ref={sendBtnRef} type="button" disabled={locked} onClick={() => setDialogOpen(true)}
          className="cursor-pointer rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">Send quote…</button>
      </div>
      <p aria-live="polite" className={msg ? 'mt-1 text-xs font-medium text-emerald-700' : 'sr-only'}>{msg}</p>
      <p className="mt-1 text-xs text-slate-500">Saving a draft never notifies the customer. Only “Send quote” does.</p>
      <SendQuoteDialog open={dialogOpen} b={b} onClose={closeDialog} onSent={onSent} />
    </section>
  )
}
