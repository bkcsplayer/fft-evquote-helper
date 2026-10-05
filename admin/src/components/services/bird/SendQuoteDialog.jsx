import { useEffect, useRef, useState } from 'react'
import { api } from '../../../services/api.js'
import { money } from '../../../utils/birdMoney.js'

// Second confirmation before the ONLY customer-notifying quote action (UI contract v1 lines 250–265).
export function SendQuoteDialog({ open, b, onClose, onSent }) {
  const backRef = useRef(null)
  const sendRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) { setErr(''); backRef.current?.focus() }
  }, [open])

  if (!open || !b.quote) return null

  function onKeyDown(e) {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab') return
    // focus trap: cycle between Back and Send now only
    const order = [backRef.current, sendRef.current].filter((x) => x && !x.disabled)
    if (!order.length) return
    const idx = order.indexOf(document.activeElement)
    const next = e.shiftKey ? (idx <= 0 ? order.length - 1 : idx - 1) : (idx + 1) % order.length
    e.preventDefault()
    order[next].focus()
  }

  async function send() {
    setBusy(true); setErr('')
    try {
      await api.post(`/services/bookings/${b.id}/quote/send`, {})
      onSent()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to send the quote.')
    } finally { setBusy(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sendQuoteTitle"
      onKeyDown={onKeyDown}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="sendQuoteTitle" className="text-lg font-bold">Send quote to customer?</h3>
        <p className="mt-1 text-sm text-slate-600">This emails and texts the quote link. The customer can sign right away.</p>
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div>To: <b>{b.email}</b></div>
          <div>SMS: <b>{b.phone}</b></div>
          <div>Total: <b>{money(b.quote.total)}</b> (incl. GST) · Deposit {money(b.quote.deposit_amount)}</div>
        </div>
        {err ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button ref={backRef} type="button" disabled={busy} onClick={onClose}
            className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Back</button>
          <button ref={sendRef} type="button" disabled={busy} onClick={send}
            className="cursor-pointer rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Sending…' : 'Send now'}</button>
        </div>
      </div>
    </div>
  )
}
