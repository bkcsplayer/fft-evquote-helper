import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell.jsx'
import { Card, SectionHeader } from '../../components/ui/Card.jsx'
import { Pill } from '../../components/ui/Pill.jsx'
import { AdminSlotPicker } from '../../components/services/AdminSlotPicker.jsx'
import { api } from '../../services/api.js'
import { humanizeStatus, toneForServiceBookingStatus } from '../../utils/serviceTone.js'
import { fmtCalgary } from '../../utils/calgaryTime.js'
import { money } from '../../utils/birdMoney.js'
import BirdBookingDetail from './BirdBookingDetail.jsx'

const DIAGNOSTIC_TRANSITIONS = {
  submitted: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
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

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  // silent: keep children mounted (open <details>, scroll, draft inputs) on post-action reloads
  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/services/bookings/${id}`)
      setB(res.data)
      setTechnician(res.data.technician || '')
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load booking') }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the route id changes
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

  async function doCancel() {
    setBusy(true)
    try { await api.post(`/services/bookings/${id}/cancel`); flash('Booking cancelled.'); await load() }
    catch (e) { flash(e?.response?.data?.detail || 'Failed to cancel') }
    finally { setBusy(false) }
  }

  if (loading) return <AdminShell><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></AdminShell>
  if (error || !b) return <AdminShell><div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error || 'Not found'}</div></AdminShell>

  if (b.service_type === 'bird_netting') return <AdminShell><BirdBookingDetail b={b} reload={() => load({ silent: true })} /></AdminShell>

  const allowedNext = DIAGNOSTIC_TRANSITIONS[b.status] || []
  const canCancel = !['completed', 'cancelled'].includes(b.status)

  return (
    <AdminShell>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/admin/services/bookings" className="text-xs font-semibold text-slate-500 hover:text-slate-700">&larr; All bookings</Link>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{b.reference_number}</h1>
            <div className="mt-1.5 flex items-center gap-2">
              <Pill tone="amber">Diagnostic</Pill>
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
              {b.scheduled_at ? <div className="text-slate-600">Scheduled: <b className="text-slate-900">{fmtCalgary(b.scheduled_at)}</b></div> : null}
              {b.technician ? <div className="text-slate-600">Technician: <b className="text-slate-900">{b.technician}</b></div> : null}
            </div>
          </Card>

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
                  <div className="font-semibold text-emerald-900">Completed {fmtCalgary(b.completed_at)}</div>
                  {b.actual_hours != null ? <div className="text-emerald-800">Hours: {b.actual_hours} · Rate: {money(b.hourly_rate_snapshot)}</div> : null}
                  {b.hardware_involved ? <div className="text-emerald-800">Hardware issue involved</div> : null}
                  {b.completion_notes ? <div className="mt-1 text-emerald-800">{b.completion_notes}</div> : null}
                </div>
              ) : null}
            </div>
          </Card>
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
            <SectionHeader eyebrow="Schedule" title="Set visit time & technician" />
            <div className="mt-3">
              <AdminSlotPicker value={slot} onChange={setSlot} />
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-600">Technician</span>
                <input value={technician} onChange={(e) => setTechnician(e.target.value)} className={input} placeholder="Assigned technician" />
              </label>
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
                  {nextStatus === 'completed' ? (
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
