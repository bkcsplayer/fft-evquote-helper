import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell.jsx'
import { Card, SectionHeader } from '../../components/ui/Card.jsx'
import { Pill } from '../../components/ui/Pill.jsx'
import { AdminSlotPicker } from '../../components/services/AdminSlotPicker.jsx'
import { api } from '../../services/api.js'
import { humanizeStatus, toneForServiceBookingStatus } from '../../utils/serviceTone.js'

const DIAGNOSTIC_TRANSITIONS = {
  submitted: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
}
const BIRD_TRANSITIONS = {
  submitted: ['survey_scheduled', 'cancelled'],
  survey_scheduled: ['quoted', 'cancelled'],
  quoted: ['approved', 'cancelled'],
  approved: ['install_scheduled', 'cancelled'],
  install_scheduled: ['completed', 'cancelled'],
}

function money(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

const btnP = 'inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 active:scale-95 disabled:opacity-60'
const btnD = 'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60'
const input = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

export default function ServiceBookingDetail() {
  const { id } = useParams()
  const [b, setB] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // schedule form
  const [slot, setSlot] = useState(null)
  const [technician, setTechnician] = useState('')

  // status form
  const [nextStatus, setNextStatus] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [hardwareInvolved, setHardwareInvolved] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')

  // bird quote form
  const [rollCount, setRollCount] = useState('')
  const [nestCount, setNestCount] = useState('0')

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/services/bookings/${id}`)
      setB(res.data)
      setTechnician(res.data.technician || '')
      if (res.data.quote) {
        setRollCount(String(res.data.quote.roll_count))
        setNestCount(String(res.data.quote.nest_count))
      }
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load booking') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function doSchedule() {
    if (!slot) return flash('Choose a time first.')
    setBusy(true)
    try {
      await api.post(`/services/bookings/${id}/schedule`, { start_at: slot, technician: technician.trim() || null })
      setSlot(null)
      flash('Scheduled.')
      await load()
    } catch (e) { flash(e?.response?.data?.detail || 'Failed to schedule') }
    finally { setBusy(false) }
  }

  async function doStatus() {
    if (!nextStatus) return
    setBusy(true)
    try {
      await api.post(`/services/bookings/${id}/status`, {
        status: nextStatus,
        actual_hours: nextStatus === 'completed' && actualHours ? Number(actualHours) : undefined,
        hardware_involved: nextStatus === 'completed' ? hardwareInvolved : undefined,
        completion_notes: nextStatus === 'completed' ? (completionNotes.trim() || undefined) : undefined,
      })
      setNextStatus('')
      flash('Status updated.')
      await load()
    } catch (e) { flash(e?.response?.data?.detail || 'Failed to update status') }
    finally { setBusy(false) }
  }

  async function doQuote() {
    if (!rollCount) return flash('Enter a roll count.')
    setBusy(true)
    try {
      await api.post(`/services/bookings/${id}/quote`, { roll_count: Number(rollCount), nest_count: Number(nestCount || 0) })
      flash('Quote saved — customer notified.')
      await load()
    } catch (e) { flash(e?.response?.data?.detail || 'Failed to save quote') }
    finally { setBusy(false) }
  }

  async function doCancel() {
    setBusy(true)
    try { await api.post(`/services/bookings/${id}/cancel`); flash('Booking cancelled.'); await load() }
    catch (e) { flash(e?.response?.data?.detail || 'Failed to cancel') }
    finally { setBusy(false) }
  }

  if (loading) return <AdminShell><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></AdminShell>
  if (error || !b) return <AdminShell><div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error || 'Not found'}</div></AdminShell>

  const isDiagnostic = b.service_type === 'diagnostic'
  const transitions = isDiagnostic ? DIAGNOSTIC_TRANSITIONS : BIRD_TRANSITIONS
  const allowedNext = transitions[b.status] || []
  const canCancel = !['completed', 'cancelled'].includes(b.status)
  const canQuote = !isDiagnostic && ['survey_scheduled', 'quoted'].includes(b.status)

  return (
    <AdminShell>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/admin/services/bookings" className="text-xs font-semibold text-slate-500 hover:text-slate-700">&larr; All bookings</Link>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{b.reference_number}</h1>
            <div className="mt-1.5 flex items-center gap-2">
              <Pill tone={isDiagnostic ? 'amber' : 'teal'}>{isDiagnostic ? 'Diagnostic' : 'Bird Netting'}</Pill>
              <Pill tone={toneForServiceBookingStatus(b.status)}>{humanizeStatus(b.status)}</Pill>
            </div>
          </div>
          {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">{msg}</div>}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeader eyebrow="Customer" title={b.customer_name} />
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="text-slate-600">{b.phone} · {b.email}</div>
              <div className="text-slate-600">{b.address}</div>
              <div className="text-slate-600">Panels: <b className="text-slate-900">{b.panel_count}</b></div>
              {b.scheduled_at ? <div className="text-slate-600">Scheduled: <b className="text-slate-900">{new Date(b.scheduled_at).toLocaleString()}</b></div> : null}
              {b.technician ? <div className="text-slate-600">Technician: <b className="text-slate-900">{b.technician}</b></div> : null}
            </div>
          </Card>

          {isDiagnostic ? (
            <Card className="p-5">
              <SectionHeader eyebrow="Diagnostic" title="Reported issue" />
              <div className="mt-3 space-y-2 text-sm">
                {b.inverter_info ? <div className="text-slate-600">Inverter: <b className="text-slate-900">{b.inverter_info}</b></div> : null}
                {(b.problem_tags || []).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {b.problem_tags.map((t) => <Pill key={t} tone="amber">{t}</Pill>)}
                  </div>
                ) : null}
                {b.problem_description ? <p className="rounded-xl bg-slate-50 p-3 text-slate-700">{b.problem_description}</p> : null}
                {b.completed_at ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="font-semibold text-emerald-900">Completed {new Date(b.completed_at).toLocaleString()}</div>
                    {b.actual_hours != null ? <div className="text-emerald-800">Hours: {b.actual_hours} · Rate: {money(b.hourly_rate_snapshot)}</div> : null}
                    {b.hardware_involved ? <div className="text-emerald-800">Hardware issue involved</div> : null}
                    {b.completion_notes ? <div className="mt-1 text-emerald-800">{b.completion_notes}</div> : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <SectionHeader eyebrow="Bird Netting" title="Quote" />
              {b.quote ? (
                <div className="mt-3 divide-y rounded-xl border text-sm">
                  <div className="flex justify-between px-3 py-2"><span className="text-slate-600">Rolls</span><b>{b.quote.roll_count}</b></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-slate-600">Nests</span><b>{b.quote.nest_count}</b></div>
                  <div className="flex justify-between px-3 py-2"><span className="font-bold text-slate-900">Total</span><b>{money(b.quote.total)}</b></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-slate-600">Status</span><Pill tone={b.quote.status === 'approved' ? 'emerald' : 'amber'}>{b.quote.status}</Pill></div>
                  {b.quote.signed_name ? <div className="flex justify-between px-3 py-2"><span className="text-slate-600">Signed by</span><b>{b.quote.signed_name}</b></div> : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No quote yet.</p>
              )}
              {canQuote ? (
                <div className="mt-3 rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{b.quote ? 'Revise quote' : 'Enter quote'}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block"><span className="text-xs text-slate-600">Rolls</span><input type="number" min="0" value={rollCount} onChange={(e) => setRollCount(e.target.value)} className={input} /></label>
                    <label className="block"><span className="text-xs text-slate-600">Nests</span><input type="number" min="0" value={nestCount} onChange={(e) => setNestCount(e.target.value)} className={input} /></label>
                  </div>
                  <button type="button" disabled={busy} onClick={doQuote} className={`${btnP} mt-2 w-full justify-center`}>Save quote &amp; notify customer</button>
                </div>
              ) : null}
            </Card>
          )}
        </div>

        {(b.photo_urls || []).length ? (
          <Card className="p-5">
            <SectionHeader eyebrow="Photos" title="Customer-submitted" />
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {b.photo_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-slate-50">
                  <img src={u} alt="" className="h-20 w-full object-cover" />
                </a>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeader eyebrow="Schedule" title={isDiagnostic ? 'Set visit time & technician' : 'Set drone survey / install time'} />
            <div className="mt-3">
              <AdminSlotPicker value={slot} onChange={setSlot} />
              {isDiagnostic ? (
                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-slate-600">Technician</span>
                  <input value={technician} onChange={(e) => setTechnician(e.target.value)} className={input} placeholder="Assigned technician" />
                </label>
              ) : null}
              <button type="button" disabled={busy || !slot} onClick={doSchedule} className={`${btnP} mt-3 w-full justify-center`}>Confirm schedule</button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader eyebrow="Status" title="Move to next status" />
            <div className="mt-3 space-y-2">
              {allowedNext.length === 0 ? (
                <p className="text-sm text-slate-500">No further transitions from this status.</p>
              ) : (
                <>
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className={input}>
                    <option value="">Choose a status…</option>
                    {allowedNext.map((s) => <option key={s} value={s}>{humanizeStatus(s)}</option>)}
                  </select>
                  {isDiagnostic && nextStatus === 'completed' ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                      <label className="block"><span className="text-xs text-slate-600">Actual hours</span><input type="number" min="0" step="0.25" value={actualHours} onChange={(e) => setActualHours(e.target.value)} className={input} /></label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hardwareInvolved} onChange={(e) => setHardwareInvolved(e.target.checked)} className="h-4 w-4" />Hardware issue involved</label>
                      <label className="block"><span className="text-xs text-slate-600">Completion notes</span><textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} className={input} rows={3} /></label>
                    </div>
                  ) : null}
                  <button type="button" disabled={busy || !nextStatus} onClick={doStatus} className={`${btnP} w-full justify-center`}>Update status</button>
                </>
              )}
              {canCancel ? (
                <button type="button" disabled={busy} onClick={doCancel} className={`${btnD} w-full justify-center`}>Cancel booking</button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}
