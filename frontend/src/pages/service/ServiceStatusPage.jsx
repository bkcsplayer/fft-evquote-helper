import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../../components/layout/QuoteShell.jsx'
import { api } from '../../services/api.js'
import { useI18n } from '../../i18n/index.js'
import { fmtCalgary, fmtCalgaryDay } from '../../utils/calgaryTime.js'
import { renderBold } from '../../utils/renderBold.jsx'

// Bird netting: 5 progress dots + 6 status texts (UI contract v1 lines 423–453).
const BIRD_DOTS = ['survey', 'quote', 'approve', 'install', 'done']
const BIRD_DOT_INDEX = { submitted: 0, survey_scheduled: 0, surveyed: 1, quoted: 2, approved: 3, install_scheduled: 3, completed: 5 }
const BIRD_STATE = { submitted: 1, survey_scheduled: 1, surveyed: 2, quoted: 3, approved: 4, install_scheduled: 5, completed: 6 }

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }) // zh-CN would print "CA$"
}

export default function ServiceStatusPage() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const [kind, setKind] = useState(null) // 'booking' | 'cleaning'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function dt(v) {
    try { return fmtCalgary(v) } catch { return String(v || '') }
  }

  function statusLabel(raw) {
    if (!raw) return '—'
    const key = `svc.status.label.${raw}`
    const label = t(key)
    return label === key ? raw : label
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    api
      .get(`/public/services/bookings/${token}`)
      .then((res) => { if (alive) { setKind('booking'); setData(res.data) } })
      .catch(() =>
        api
          .get(`/public/services/cleaning/${token}`)
          .then((res) => { if (alive) { setKind('cleaning'); setData(res.data) } })
          .catch((e) => { if (alive) setError(e?.response?.data?.detail || t('svc.status.not_found')) })
      )
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <QuoteShell>
      <div className="space-y-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('svc.status.reference')}</div>
          <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-zinc-900">{data?.reference_number || '—'}</div>
        </div>

        {loading ? <div className="text-sm text-zinc-500">{t('svc.status.loading')}</div> : null}
        {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {kind === 'booking' && data && data.service_type === 'bird_netting' ? (
          <BirdStatus data={data} token={token} t={t} locale={locale} />
        ) : null}

        {kind === 'booking' && data && data.service_type !== 'bird_netting' ? (
          <>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('svc.status.current')}</div>
              <div className="mt-1.5 text-lg font-bold text-slate-900">{statusLabel(data.status)}</div>
              {data.scheduled_at ? <div className="mt-2 text-sm text-slate-700">{t('svc.status.scheduled_at', { dt: dt(data.scheduled_at) })}</div> : null}
              {data.technician ? <div className="mt-1 text-sm text-slate-700">{t('svc.status.technician', { name: data.technician })}</div> : null}
              {data.completed_at ? <div className="mt-1 text-sm text-slate-700">{t('svc.status.completed_at', { dt: dt(data.completed_at) })}</div> : null}
            </div>

            {data.quote ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('svc.bird.quote.title')}</div>
                <div className="mt-1.5 text-sm text-slate-700">{t('svc.status.quote_total', { total: money(data.quote.total, locale) })}</div>
                {data.quote.status !== 'approved' ? (
                  <div className="mt-3">
                    <Link
                      to={`/service/bird-netting/quote/${token}`}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      {t('svc.status.view_quote')}
                    </Link>
                  </div>
                ) : (
                  <div className="mt-2 inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{t('svc.bird.quote.approved')}</div>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {kind === 'cleaning' && data ? (
          <>
            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('svc.status.annual_price')}</div>
              <div className="mt-1.5 text-lg font-bold text-slate-900">
                {data.pricing_status === 'pending_quote' ? t('svc.status.tier_pending') : money(data.annual_price, locale)}
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {t('svc.status.payment_status')}: <span className="font-semibold">{t(`svc.status.payment.${data.payment_status}`)}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('svc.status.cleaning_visits')}</div>
              <div className="mt-3 space-y-2">
                {(data.visits || []).map((v) => (
                  <div key={v.quarter} className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3.5 py-2.5 text-sm">
                    <div className="font-semibold text-slate-800">{t('svc.status.visit_quarter', { n: v.quarter })}</div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{v.scheduled_date ? dt(v.scheduled_date) : '—'}</div>
                      <div className="font-semibold text-slate-800">{t(`svc.status.visit.${v.status}`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </QuoteShell>
  )
}

function BirdStatus({ data, token, t, locale }) {
  const card = 'rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm'
  const head = 'text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400'
  const body = 'text-sm text-slate-700'
  const note = 'mt-2 text-xs text-slate-500'
  if (data.status === 'cancelled') {
    return (
      <div className={card}>
        <div className={head}>{t('svc.status.current')}</div>
        <div className="mt-1 text-lg font-bold">{t('svc.status.label.cancelled')}</div>
      </div>
    )
  }
  const step = BIRD_DOT_INDEX[data.status] ?? 0
  const n = BIRD_STATE[data.status] ?? 1
  const q = data.quote
  const m = (v) => money(v, locale)
  let content
  if (n === 1) {
    content = (<><div className={body}>{renderBold(t('svc.status.bird.s1.body', { dt: data.scheduled_at ? fmtCalgary(data.scheduled_at) : '—' }))}</div><p className={note}>{t('svc.status.bird.s1.note')}</p></>)
  } else if (n === 2) {
    // draft stage: the API exposes no amounts — and nothing here renders any
    content = <div className={body}>{renderBold(t('svc.status.bird.s2.body', { day: data.surveyed_at ? fmtCalgaryDay(data.surveyed_at) : '—' }))}</div>
  } else if (n === 3) {
    content = (
      <>
        <div className={body}>{renderBold(t('svc.status.bird.s3.body', { total: m(q?.total) }))}</div>
        <Link to={`/service/bird-netting/quote/${token}`} className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
          {t('svc.status.view_quote')}
        </Link>
      </>
    )
  } else if (n === 4) {
    content = (<><div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{renderBold(t('svc.status.bird.s4.body', { deposit: m(q?.deposit_amount), email: data.etransfer_email }))}</div><p className={note}>{t('svc.status.bird.s4.note')}</p></>)
  } else if (n === 5) {
    content = (
      <>
        <div className={body}>{renderBold(t('svc.status.bird.s5.body', { dt: data.scheduled_at ? fmtCalgary(data.scheduled_at) : '—' }))}</div>
        {data.technician ? <div className={`mt-1 ${body}`}>{t('svc.status.technician', { name: data.technician })}</div> : null}
        <p className={note}>{t('svc.status.bird.s5.note')}</p>
      </>
    )
  } else {
    content = (
      <>
        <div className={body}>{renderBold(t('svc.status.bird.s6.body', { day: data.completed_at ? fmtCalgaryDay(data.completed_at) : '—' }))}</div>
        {q ? (
          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
            {renderBold(t('svc.status.bird.s6.balance', { balance: m(q.balance_amount) }))}<br />
            <span className="text-xs text-slate-500">{t('svc.status.bird.s6.sum', { deposit: m(q.deposit_amount), balance: m(q.balance_amount), total: m(q.total) })}</span>
          </div>
        ) : null}
      </>
    )
  }
  return (
    <>
      <ol className="flex items-start justify-between">
        {BIRD_DOTS.map((d, k) => {
          const done = k < step || step === 5
          const cur = k === step && step !== 5
          return (
            <li key={d} className="flex flex-1 flex-col items-center" aria-current={cur ? 'step' : undefined}>
              <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-teal-700' : cur ? 'bg-white ring-2 ring-teal-700' : 'bg-slate-200'}`} aria-hidden="true" />
              <span className={`mt-1 text-[10px] ${cur ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{t(`svc.status.bird.step.${d}`)}</span>
            </li>
          )
        })}
      </ol>
      <div className={card}>
        <div className={head}>{t('svc.status.current')}</div>
        <div className="mt-1 text-lg font-bold">{t(`svc.status.bird.s${n}.title`)}</div>
        <div className="mt-2">{content}</div>
      </div>
    </>
  )
}
