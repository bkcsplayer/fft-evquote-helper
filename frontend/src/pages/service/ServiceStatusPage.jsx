import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../../components/layout/QuoteShell.jsx'
import { api } from '../../services/api.js'
import { useI18n } from '../../i18n/index.js'

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD' })
}

export default function ServiceStatusPage() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const [kind, setKind] = useState(null) // 'booking' | 'cleaning'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function dt(v) {
    try { return new Date(v).toLocaleString(locale) } catch { return String(v || '') }
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

        {kind === 'booking' && data ? (
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
