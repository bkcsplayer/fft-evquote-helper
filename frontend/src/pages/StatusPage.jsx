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
      return new Date(v).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA')
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
      setError(e?.response?.data?.detail || 'Unable to submit request')
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
      setError(e?.response?.data?.detail || 'Unable to submit request')
    } finally {
      setInstallReqBusy(false)
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyReqDt, data?.survey_requested_date])

  const installReqDtValue = useMemo(() => {
    if (installReqDt) return installReqDt
    if (data?.installation_requested_date) return toLocalInputValue(data.installation_requested_date)
    return ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            ) : (
              <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('status.survey')}</div>
                <div className="mt-1 text-slate-800">
                  {lang === 'zh' ? '请选择上门勘查时间（我们确认后才会安排上门）' : 'Choose a site survey time (we will confirm before scheduling)'}
                </div>

                {data.survey_request_status === 'pending' && data.survey_requested_date ? (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {lang === 'zh' ? '你已提交时间，等待确认：' : 'Requested (waiting for confirmation): '}
                    <span className="font-semibold">{dt(data.survey_requested_date)}</span>
                  </div>
                ) : null}

                {data.survey_request_status === 'rejected' ? (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-semibold">{lang === 'zh' ? '该时间无法安排，请重新选择' : 'That time is not available. Please choose another.'}</div>
                    {data.survey_request_admin_note ? (
                      <div className="mt-1 text-amber-800">{data.survey_request_admin_note}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="block sm:col-span-1">
                    <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {lang === 'zh' ? '预约时间（本地）' : 'Preferred time (local)'}
                    </div>
                    <input
                      type="datetime-local"
                      value={surveyReqDtValue}
                      onChange={(e) => setSurveyReqDt(e.target.value)}
                      disabled={surveyReqBusy}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {lang === 'zh' ? '备注（可选）' : 'Note (optional)'}
                    </div>
                    <input
                      value={surveyReqNote}
                      onChange={(e) => setSurveyReqNote(e.target.value)}
                      disabled={surveyReqBusy}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                      placeholder={lang === 'zh' ? '例如：周末可，或门禁说明…' : 'e.g. weekend works, gate code…'}
                    />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={surveyReqBusy || !surveyReqDt}
                      onClick={submitSurveyRequest}
                      className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      {lang === 'zh' ? '提交时间' : 'Submit time'}
                    </button>
                    <div className="text-xs text-slate-500 self-center">
                      {lang === 'zh'
                        ? '提交后，我们会确认该时间；如不合适会退回让你重新选择。'
                        : 'After you submit, we’ll confirm it. If unavailable, we’ll ask you to choose again.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showInstallScheduling ? (
              data.installation_scheduled_date ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {lang === 'zh' ? '安装' : 'Installation'}
                  </div>
                  <div className="mt-1 text-slate-800">
                    {lang === 'zh' ? '已安排：' : 'Scheduled: '} <span className="font-semibold">{dt(data.installation_scheduled_date)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border bg-white p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {lang === 'zh' ? '安装' : 'Installation'}
                  </div>
                  <div className="mt-1 text-slate-800">
                    {lang === 'zh' ? '请选择安装时间（我们确认后才会安排施工）' : 'Choose an installation time (we will confirm before scheduling)'}
                  </div>

                  {data.installation_request_status === 'pending' && data.installation_requested_date ? (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {lang === 'zh' ? '你已提交时间，等待确认：' : 'Requested (waiting for confirmation): '}
                      <span className="font-semibold">{dt(data.installation_requested_date)}</span>
                    </div>
                  ) : null}

                  {data.installation_request_status === 'rejected' ? (
                    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <div className="font-semibold">{lang === 'zh' ? '该时间无法安排，请重新选择' : 'That time is not available. Please choose another.'}</div>
                      {data.installation_request_admin_note ? (
                        <div className="mt-1 text-amber-800">{data.installation_request_admin_note}</div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block sm:col-span-1">
                      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {lang === 'zh' ? '预约时间（本地）' : 'Preferred time (local)'}
                      </div>
                      <input
                        type="datetime-local"
                        value={installReqDtValue}
                        onChange={(e) => setInstallReqDt(e.target.value)}
                        disabled={installReqBusy}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {lang === 'zh' ? '备注（可选）' : 'Note (optional)'}
                      </div>
                      <input
                        value={installReqNote}
                        onChange={(e) => setInstallReqNote(e.target.value)}
                        disabled={installReqBusy}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                        placeholder={lang === 'zh' ? '例如：工作日晚上更方便…' : 'e.g. evenings are better…'}
                      />
                    </label>
                    <div className="sm:col-span-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={installReqBusy || !installReqDt}
                        onClick={submitInstallRequest}
                        className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                      >
                        {lang === 'zh' ? '提交时间' : 'Submit time'}
                      </button>
                      <div className="text-xs text-slate-500 self-center">
                        {lang === 'zh'
                          ? '提交后，我们会确认该时间；如不合适会退回让你重新选择。'
                          : 'After you submit, we’ll confirm it. If unavailable, we’ll ask you to choose again.'}
                      </div>
                    </div>
                  </div>
                </div>
              )
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

