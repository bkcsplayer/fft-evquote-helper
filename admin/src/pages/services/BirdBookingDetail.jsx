import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pill } from '../../components/ui/Pill.jsx'
import { BirdStepper } from '../../components/services/bird/BirdStepper.jsx'
import { SurveyStageCard } from '../../components/services/bird/SurveyStageCard.jsx'
import { SurveySummaryCard } from '../../components/services/bird/SurveySummaryCard.jsx'
import { QuoteDraftCard } from '../../components/services/bird/QuoteDraftCard.jsx'
import { QuoteSummaryCard } from '../../components/services/bird/QuoteSummaryCard.jsx'
import { InstallStageCard } from '../../components/services/bird/InstallStageCard.jsx'
import { api } from '../../services/api.js'
import { BIRD_STATUS_LABEL, toneForServiceBookingStatus } from '../../utils/serviceTone.js'
import { fmtCalgary, fmtCalgaryShort } from '../../utils/calgaryTime.js'
import { money } from '../../utils/birdMoney.js'

const label = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500'
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
const secondary = 'cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'

// Timeline rows only for events that happened (contract lines 66–69 + HIST copy).
function timeline(b) {
  const q = b.quote
  const s = b.survey
  const appts = b.survey_appointments || []
  const firstSurvey = appts[0]?.start_at || (b.status === 'survey_scheduled' ? b.scheduled_at : null)
  const rows = [
    [b.created_at, `Booked online${firstSurvey ? ` · survey ${fmtCalgary(firstSurvey)}` : ''}`],
    ...appts.slice(1).map((a) => [a.booked_at, `Survey rescheduled · ${fmtCalgary(a.start_at)}`]),
    [b.surveyed_at, s ? `Survey result recorded · ${s.perimeter_ft} ft, ${s.nest_count} nest${s.nest_count === 1 ? '' : 's'}` : 'Survey result recorded'],
    [q?.sent_at, q ? `Quote sent · ${money(q.total)}` : ''],
    [q?.approved_at, 'Signed by customer · deposit invoice sent'],
    [['install_scheduled', 'completed'].includes(b.status) ? b.install_booked_at : null, `Install scheduled · ${b.scheduled_at ? fmtCalgary(b.scheduled_at) : ''}`],
    [b.completed_at, 'Completed · balance invoice sent'],
  ]
  return rows.filter(([at]) => at)
}

function WaitingCard({ b, reload }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function revise() {
    setBusy(true); setErr('')
    try { await api.post(`/services/bookings/${b.id}/quote/revise`); await reload() }
    catch (e) { setErr(e?.response?.data?.detail || 'Failed to revise the quote.') }
    finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current step · 3 of 6</div>
      <h2 className="mt-1 text-lg font-bold">Waiting for customer signature</h2>
      <p className="mt-2 text-sm text-slate-600">The customer received the quote link by email and SMS. Nothing to do here until they sign.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={!b.quote?.preview_url} onClick={() => window.open(b.quote.preview_url, '_blank', 'noopener')}>View customer page</button>
        <button type="button" className={secondary} disabled={busy} onClick={revise}>{busy ? 'Revising…' : 'Revise quote (back to draft)'}</button>
      </div>
      {err ? <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{err}</p> : null}
    </section>
  )
}

function StageCards({ b, reload }) {
  const st = b.status
  if (st === 'cancelled') {
    return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">This booking was cancelled.</section>
  }
  const needsSurvey = st === 'survey_scheduled' || st === 'submitted' || (st === 'surveyed' && !b.survey)
  if (needsSurvey) return <SurveyStageCard b={b} reload={reload} />
  const q = b.quote
  return (
    <>
      <SurveySummaryCard b={b} />
      {st === 'surveyed' ? <QuoteDraftCard b={b} reload={reload} /> : <QuoteSummaryCard b={b} />}
      {st === 'quoted' ? <WaitingCard b={b} reload={reload} /> : null}
      {st === 'approved' || st === 'install_scheduled' ? <InstallStageCard b={b} reload={reload} /> : null}
      {st === 'completed' ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-lg font-bold text-emerald-900">Completed{b.completed_at ? ` · ${fmtCalgaryShort(b.completed_at)}` : ''}</h2>
          {q ? (
            <p className="mt-1 text-sm text-emerald-800">
              Balance invoice {money(q.balance_amount)} sent. Deposit {money(q.deposit_amount)} + balance {money(q.balance_amount)} = {money(q.total)}.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

// Stage-guided detail page for a bird-netting booking (UI contract design/mockups/v1.html, frozen).
export default function BirdBookingDetail({ b, reload }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canCancel = !['completed', 'cancelled'].includes(b.status)

  async function cancel() {
    if (!window.confirm('Cancel this booking? This cannot be undone.')) return
    setBusy(true); setErr('')
    try { await api.post(`/services/bookings/${b.id}/cancel`); await reload() }
    catch (e) { setErr(e?.response?.data?.detail || 'Failed to cancel the booking.') }
    finally { setBusy(false) }
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/services/bookings" className="text-xs font-semibold text-slate-500 hover:text-slate-700">&larr; All bookings</Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight">{b.reference_number}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold">
            <Pill tone="teal">Bird Netting</Pill>
            <Pill tone={toneForServiceBookingStatus(b.status)}>{BIRD_STATUS_LABEL[b.status] || b.status}</Pill>
          </div>
        </div>
        {canCancel ? (
          <div className="text-right">
            <button type="button" disabled={busy} onClick={cancel}
              className="cursor-pointer rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel booking</button>
            {err ? <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{err}</p> : null}
          </div>
        ) : null}
      </div>

      {b.status === 'cancelled' ? null : <BirdStepper status={b.status} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <section className={card}>
            <div className={label}>Customer</div>
            <div className="mt-1 text-base font-bold">{b.customer_name}</div>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <div>{b.phone} · {b.email}</div>
              <div>{b.address}</div>
              <div>Panels: <b className="text-slate-900">{b.panel_count}</b></div>
            </div>
          </section>
          <section className={card}>
            <div className={label}>Timeline</div>
            <ul className="mt-3 space-y-3 text-sm">
              {timeline(b).map(([at, text]) => (
                <li key={text} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
                  <div><div className="text-xs text-slate-500">{fmtCalgaryShort(at)}</div><div>{text}</div></div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <StageCards b={b} reload={reload} />
        </div>
      </div>
    </div>
  )
}
