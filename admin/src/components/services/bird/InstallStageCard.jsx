import { useState } from 'react'
import { AdminSlotPicker } from '../AdminSlotPicker.jsx'
import { api } from '../../../services/api.js'
import { fmtCalgary } from '../../../utils/calgaryTime.js'
import { money } from '../../../utils/birdMoney.js'

const field = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
const primary = 'mt-3 w-full cursor-pointer rounded-xl bg-emerald-700 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'
const errText = 'mt-1 text-xs font-medium text-rose-700'

// Stages ④/⑤ — schedule the installation, then mark it completed (UI contract v1 lines 205–237).
export function InstallStageCard({ b, reload }) {
  const [slot, setSlot] = useState(null)
  const [technician, setTechnician] = useState(b.technician || '')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const balance = b.quote?.balance_amount

  async function run(fn, fallback) {
    setBusy(true); setErr('')
    try { await fn(); await reload() } catch (e) { setErr(e?.response?.data?.detail || fallback) } finally { setBusy(false) }
  }

  const schedule = () => run(async () => {
    await api.post(`/services/bookings/${b.id}/schedule`, { start_at: slot, technician: technician.trim() || null })
    setSlot(null)
  }, 'Failed to schedule the installation.')

  function complete() {
    if (!window.confirm('Mark completed and email the balance invoice (' + money(balance) + ') to the customer? This cannot be undone.')) return
    run(() => api.post(`/services/bookings/${b.id}/status`, { status: 'completed', completion_notes: notes.trim() || undefined }),
      'Failed to mark the booking completed.')
  }

  if (b.status === 'approved') {
    return (
      <section className="rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current step · 4 of 6</div>
        <h2 className="mt-1 text-lg font-bold">Schedule installation</h2>
        <p className="mt-1 text-sm text-slate-600">Deposit invoice ({money(b.quote?.deposit_amount)}) was emailed on approval.</p>
        <div className="mt-3"><AdminSlotPicker value={slot} onChange={setSlot} /></div>
        <label className="mt-3 block text-sm"><span className="text-xs font-semibold text-slate-600">Technician</span>
          <input value={technician} onChange={(e) => setTechnician(e.target.value)} className={field} placeholder="Assigned technician" /></label>
        <button type="button" disabled={busy || !slot} onClick={schedule} className={primary}>
          {busy ? 'Saving…' : 'Confirm install time & notify customer'}
        </button>
        {err ? <p role="alert" className={errText}>{err}</p> : null}
      </section>
    )
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current step · 5 of 6</div>
      <h2 className="mt-1 text-lg font-bold">Installation</h2>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <span>Install time: <b>{b.scheduled_at ? fmtCalgary(b.scheduled_at) : '—'}</b></span>
      </div>
      <details className="mt-3 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Change install time</summary>
        <div className="mt-3"><AdminSlotPicker value={slot} onChange={setSlot} /></div>
        <button type="button" disabled={busy || !slot} onClick={schedule}
          className="mt-3 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
          Reschedule install &amp; notify customer
        </button>
      </details>
      <label className="mt-3 block text-sm"><span className="text-xs font-semibold text-slate-600">Completion notes</span>
        <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></label>
      <button type="button" disabled={busy} onClick={complete} className={primary}>
        {busy ? 'Saving…' : `Mark completed & send balance invoice (${money(balance)})`}
      </button>
      {err ? <p role="alert" className={errText}>{err}</p> : null}
    </section>
  )
}
