import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

const ORDER = [
  'pending',
  'survey_scheduled',
  'survey_completed',
  'quoting',
  'quoted',
  'customer_approved',
  'permit_applied',
  'permit_approved',
  'installation_scheduled',
  'installed',
  'completed',
]

export default function StatusPage() {
  const { token } = useParams()
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

  function statusLabel(raw) {
    if (!raw) return '—'
    const key = `status.label.${raw}`
    const label = t(key)
    return label === key ? raw : label
  }

  function dt(v) {
    try {
      return new Date(v).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')
    } catch {
      return String(v || '')
    }
  }

  async function load() {
    setError('')
    const [s, tl] = await Promise.all([api.get(`/cases/status/${token}`), api.get(`/cases/timeline/${token}`)])
    setData(s.data)
    setTimeline(tl.data || [])
    setLastUpdatedAt(new Date())
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    load()
      .catch((e) => alive && setError(e?.response?.data?.detail || t('status.not_found')))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (!autoRefresh) return
    let cancelled = false
    const timer = setInterval(() => {
      if (cancelled) return
      load().catch(() => {})
    }, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, token])

  const progress = useMemo(() => {
    const status = data?.status
    if (!status) return 0
    const idx = ORDER.indexOf(status)
    return idx >= 0 ? Math.round(((idx + 1) / ORDER.length) * 100) : 0
  }, [data])

  const depositReported = useMemo(() => {
    if (data?.survey_deposit_paid) return false
    return (timeline || []).some((x) => String(x?.note || '').toLowerCase().includes('e-transfer'))
  }, [data, timeline])

  const quoteApproved = useMemo(() => {
    const st = String(data?.status || '')
    return ORDER.indexOf(st) >= ORDER.indexOf('customer_approved')
  }, [data])

  return (
    <QuoteShell>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('status.case')}</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">{data?.reference_number || '—'}</div>

        {loading ? <div className="mt-4 text-sm text-slate-600">{t('status.loading')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {data ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div>
                Auto refresh:{' '}
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className="font-semibold text-slate-800 underline"
                >
                  {autoRefresh ? 'on' : 'off'}
                </button>
                {lastUpdatedAt ? <span className="ml-2">Last updated: {lastUpdatedAt.toLocaleTimeString()}</span> : null}
              </div>
              <button
                type="button"
                onClick={() => load().catch((e) => setError(e?.response?.data?.detail || t('status.not_found')))}
                className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Refresh now
              </button>
            </div>
            <div className="mt-4">
              <div className="text-sm font-medium text-slate-800">{t('status.current')}</div>
              <div className="mt-1 text-sm text-slate-700">{statusLabel(data.status)}</div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('status.progress')}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {data.survey_scheduled_date ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('status.survey')}</div>
                <div className="mt-1 text-slate-800">
                  {t('status.scheduled', { dt: dt(data.survey_scheduled_date) })}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('status.deposit', {
                    state: data.survey_deposit_paid ? t('status.deposit.paid') : t('status.deposit.unpaid'),
                  })}
                </div>
                {!data.survey_deposit_paid && !depositReported ? (
                  <div className="mt-3">
                    <Link
                      to={`/quote/survey-confirm/${token}`}
                      className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {t('status.confirm_pay')}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {depositReported ? (
              <div className="mt-4 rounded-xl border bg-amber-50 p-3 text-sm">
                <div className="font-semibold text-amber-900">{t('status.deposit_reported_title')}</div>
                <div className="mt-1 text-amber-800">{t('status.deposit_reported_body')}</div>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4 text-sm">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{lang === 'zh' ? '当前摘要' : 'Summary'}</div>
              <div className="mt-2 grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{lang === 'zh' ? '定金' : 'Deposit'}</div>
                  <div className="font-semibold text-slate-900">
                    {data.survey_deposit_paid ? (lang === 'zh' ? '已确认' : 'Confirmed') : depositReported ? (lang === 'zh' ? '已提交，待确认' : 'Reported') : (lang === 'zh' ? '未确认' : 'Not confirmed')}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{lang === 'zh' ? '报价签字' : 'Quote signature'}</div>
                  <div className="font-semibold text-slate-900">{quoteApproved ? (lang === 'zh' ? '已签字' : 'Signed') : (lang === 'zh' ? '未签字' : 'Not signed')}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{lang === 'zh' ? '状态' : 'Status'}</div>
                  <div className="font-semibold text-slate-900">{statusLabel(data.status)}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <Link
                to={`/quote/view/${token}`}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t('status.view_quote')}
              </Link>
              {!quoteApproved ? (
                <Link
                  to={`/quote/approve/${token}`}
                  className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {t('status.approve_quote')}
                </Link>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="text-sm font-medium text-slate-800">{t('status.timeline')}</div>
              <div className="mt-2 space-y-2">
                {timeline.map((row, idx) => (
                  <div key={idx} className="rounded-xl border bg-white px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">{dt(row.created_at)}</div>
                    <div className="mt-1 text-slate-800">
                      {statusLabel(row.from_status) + ' → '}
                      <span className="font-semibold">{statusLabel(row.to_status)}</span>
                    </div>
                    {row.note ? <div className="mt-1 text-xs text-slate-500">{row.note}</div> : null}
                  </div>
                ))}
                {timeline.length === 0 ? <div className="text-sm text-slate-600">{t('status.no_timeline')}</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </QuoteShell>
  )
}

