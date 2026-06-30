import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { StageFlow } from '../components/StageFlow.jsx'
import { SlotPicker } from '../components/SlotPicker.jsx'
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

function computeNext(data) {
  const s = data?.status
  const depositPaid = data?.survey_deposit_paid
  if (s === 'pending') return { titleKey: 'next.title.book_survey', subKey: 'next.sub.book_survey', tone: 'act' }
  if (s === 'survey_scheduled')
    return depositPaid
      ? { titleKey: 'next.title.wait_survey', subKey: 'next.sub.wait_survey', tone: 'wait' }
      : { titleKey: 'next.title.pay_deposit', subKey: 'next.sub.pay_deposit', tone: 'act' }
  if (s === 'survey_completed' || s === 'quoting') return { titleKey: 'next.title.wait_prep', subKey: 'next.sub.wait_prep', tone: 'wait' }
  if (s === 'quoted') return { titleKey: 'next.title.sign_quote', subKey: 'next.sub.sign_quote', tone: 'act' }
  if (s === 'customer_approved' || s === 'permit_applied') return { titleKey: 'next.title.wait_permit', subKey: 'next.sub.wait_permit', tone: 'wait' }
  if (s === 'permit_approved') return { titleKey: 'next.title.book_install', subKey: 'next.sub.book_install', tone: 'act' }
  if (s === 'installation_scheduled' || s === 'installed') return { titleKey: 'next.title.wait_install', subKey: 'next.sub.wait_install', tone: 'wait' }
  if (s === 'completed') return { titleKey: 'next.title.done', subKey: 'next.sub.done', tone: 'done' }
  return { titleKey: 'next.title.wait_prep', subKey: 'next.sub.wait_prep', tone: 'wait' }
}

const NEXT_TONE = {
  act: 'bg-gradient-to-br from-emerald-800 to-emerald-950',
  wait: 'bg-gradient-to-br from-zinc-800 to-zinc-950',
  done: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
}

export default function StatusPage() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const [data, setData] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [surveyReqDt, setSurveyReqDt] = useState('')
  const [surveyReqNote, setSurveyReqNote] = useState('')
  const [surveyReqBusy, setSurveyReqBusy] = useState(false)
  const [installReqDt, setInstallReqDt] = useState('')
  const [installReqNote, setInstallReqNote] = useState('')
  const [installReqBusy, setInstallReqBusy] = useState(false)

  function statusLabel(raw) {
    if (!raw) return '—'
    const key = `status.label.${raw}`
    const label = t(key)
    return label === key ? raw : label
  }

  function dt(v) {
    try {
      return new Date(v).toLocaleString(locale)
    } catch {
      return String(v || '')
    }
  }

  function toLocalInputValue(v) {
    try {
      const d = new Date(v)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return ''
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

  async function submitSurveyRequest() {
    const v = surveyReqDt || (data?.survey_requested_date ? toLocalInputValue(data.survey_requested_date) : '')
    if (!v) return
    setSurveyReqBusy(true)
    setError('')
    try {
      await api.post(`/cases/survey/request/${token}`, {
        requested_date: new Date(v).toISOString(),
        note: surveyReqNote.trim() || null,
      })
      setSurveyReqNote('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || t('status.err.submit_request'))
    } finally {
      setSurveyReqBusy(false)
    }
  }

  async function submitInstallRequest() {
    const v =
      installReqDt || (data?.installation_requested_date ? toLocalInputValue(data.installation_requested_date) : '')
    if (!v) return
    setInstallReqBusy(true)
    setError('')
    try {
      await api.post(`/cases/installation/request/${token}`, {
        requested_date: new Date(v).toISOString(),
        note: installReqNote.trim() || null,
      })
      setInstallReqNote('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || t('status.err.submit_request'))
    } finally {
      setInstallReqBusy(false)
    }
  }

  // Permit sub-status shown to the customer in the stage flow (derived from the case status —
  // permit_applied / permit_approved are case statuses, so no extra backend field is needed).
  const permitDetail = useMemo(() => {
    const st = String(data?.status || '')
    const i = ORDER.indexOf(st)
    if (i < 0) return undefined
    if (i >= ORDER.indexOf('permit_approved')) return t('permit.approved')
    if (st === 'permit_applied') return t('permit.applied')
    if (i >= ORDER.indexOf('customer_approved')) return t('permit.pending')
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status])

  // Install scheduling is gated on permit approval; show an explanatory card before then.
  const installLockedByPermit = useMemo(() => {
    const i = ORDER.indexOf(String(data?.status || ''))
    return i >= ORDER.indexOf('customer_approved') && i < ORDER.indexOf('permit_approved')
  }, [data?.status])

  const depositReported = useMemo(() => {
    if (data?.survey_deposit_paid) return false
    // Prefer the structured backend flag; fall back to timeline scan for older cases.
    if (data?.survey_deposit_reported) return true
    return (timeline || []).some((x) => String(x?.note || '').toLowerCase().includes('e-transfer'))
  }, [data, timeline])

  const quoteApproved = useMemo(() => {
    const st = String(data?.status || '')
    return ORDER.indexOf(st) >= ORDER.indexOf('customer_approved')
  }, [data])

  // The quote is only customer-visible once admin has sent it (status reaches "quoted").
  const hasSentQuote = useMemo(() => {
    return ORDER.indexOf(String(data?.status || '')) >= ORDER.indexOf('quoted')
  }, [data])

  const showInstallScheduling = useMemo(() => {
    const st = String(data?.status || '')
    const i = ORDER.indexOf(st)
    const permitI = ORDER.indexOf('permit_approved')
    return i >= 0 && permitI >= 0 && i >= permitI
  }, [data])

  const surveyReqDtValue = useMemo(() => {
    if (surveyReqDt) return surveyReqDt
    if (data?.survey_requested_date) return toLocalInputValue(data.survey_requested_date)
    return ''
  }, [surveyReqDt, data?.survey_requested_date])

  const installReqDtValue = useMemo(() => {
    if (installReqDt) return installReqDt
    if (data?.installation_requested_date) return toLocalInputValue(data.installation_requested_date)
    return ''
  }, [installReqDt, data?.installation_requested_date])

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
                {t('status.autorefresh')}{' '}
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className="font-semibold text-slate-800 underline"
                >
                  {autoRefresh ? t('status.autorefresh.on') : t('status.autorefresh.off')}
                </button>
                {lastUpdatedAt ? <span className="ml-2">{t('status.last_updated', { time: lastUpdatedAt.toLocaleTimeString(locale) })}</span> : null}
              </div>
              <button
                type="button"
                onClick={() => load().catch((e) => setError(e?.response?.data?.detail || t('status.not_found')))}
                className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                {t('status.refresh_now')}
              </button>
            </div>
            <div className="mt-4">
              <div className="text-sm font-medium text-slate-800">{t('status.current')}</div>
              <div className="mt-1 text-sm text-slate-700">{statusLabel(data.status)}</div>
            </div>

            {(() => {
              const na = computeNext(data)
              return (
                <div className={`mt-4 overflow-hidden rounded-3xl p-6 text-white shadow-lg ${NEXT_TONE[na.tone]}`}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{t('next.heading')}</div>
                  <div className="mt-2.5 text-2xl font-extrabold tracking-tight">{t(na.titleKey)}</div>
                  <div className="mt-1.5 text-sm font-medium text-white/80">{t(na.subKey)}</div>
                </div>
              )
            })()}

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('stage.flow_title')}</div>
              <div className="mt-2">
                <StageFlow status={data.status} details={{ permit: permitDetail }} />
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
            ) : (
              <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('status.survey')}</div>
                <div className="mt-1 text-slate-800">
                  {t('status.survey.choose_prompt')}
                </div>

                {data.survey_request_status === 'pending' && data.survey_requested_date ? (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {t('status.request.waiting')}
                    <span className="font-semibold">{dt(data.survey_requested_date)}</span>
                  </div>
                ) : null}

                {data.survey_request_status === 'rejected' ? (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-semibold">{t('status.request.rejected')}</div>
                    {data.survey_request_admin_note ? (
                      <div className="mt-1 text-amber-800">{data.survey_request_admin_note}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3">
                  <SlotPicker token={token} kind="survey" onBooked={load} />
                </div>
              </div>
            )}

            {showInstallScheduling ? (
              data.installation_scheduled_date ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {t('status.installation')}
                  </div>
                  <div className="mt-1 text-slate-800">
                    {t('status.installation.scheduled')} <span className="font-semibold">{dt(data.installation_scheduled_date)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {t('status.installation')}
                  </div>
                  <div className="mt-1 text-slate-800">
                    {t('status.installation.choose_prompt')}
                  </div>

                  {data.installation_request_status === 'pending' && data.installation_requested_date ? (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {t('status.request.waiting')}
                      <span className="font-semibold">{dt(data.installation_requested_date)}</span>
                    </div>
                  ) : null}

                  {data.installation_request_status === 'rejected' ? (
                    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <div className="font-semibold">{t('status.request.rejected')}</div>
                      {data.installation_request_admin_note ? (
                        <div className="mt-1 text-amber-800">{data.installation_request_admin_note}</div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <SlotPicker token={token} kind="install" onBooked={load} />
                  </div>
                </div>
              )
            ) : installLockedByPermit ? (
              <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('stage.install')}</div>
                <div className="mt-1 font-semibold text-slate-800">{t('install.locked.title')}</div>
                <div className="mt-1 text-slate-600">{t('install.locked.body')}</div>
                {permitDetail ? <div className="mt-2 inline-flex rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{permitDetail}</div> : null}
              </div>
            ) : null}

            {depositReported ? (
              <div className="mt-4 rounded-xl border bg-amber-50 p-3 text-sm">
                <div className="font-semibold text-amber-900">{t('status.deposit_reported_title')}</div>
                <div className="mt-1 text-amber-800">{t('status.deposit_reported_body')}</div>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4 text-sm">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('status.summary')}</div>
              <div className="mt-2 grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{t('status.summary.deposit')}</div>
                  <div className="font-semibold text-slate-900">
                    {data.survey_deposit_paid
                      ? t('status.summary.deposit.confirmed')
                      : depositReported
                        ? t('status.summary.deposit.reported')
                        : t('status.summary.deposit.not_confirmed')}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{t('status.summary.signature')}</div>
                  <div className="font-semibold text-slate-900">{quoteApproved ? t('status.summary.signed') : t('status.summary.not_signed')}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">{t('status.summary.status')}</div>
                  <div className="font-semibold text-slate-900">{statusLabel(data.status)}</div>
                </div>
              </div>
            </div>

            {hasSentQuote ? (
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
            ) : null}

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

