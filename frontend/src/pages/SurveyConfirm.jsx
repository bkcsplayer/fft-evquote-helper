import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

export default function SurveyConfirm() {
  const { token } = useParams()
  const { t } = useI18n()
  const [status, setStatus] = useState(null)
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [senderName, setSenderName] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([api.get(`/cases/status/${token}`), api.get(`/payments/etransfer-info/${token}`)])
      .then(([s, i]) => {
        if (!alive) return
        setStatus(s.data)
        setInfo(i.data)
      })
      .catch((e) => alive && setError(e?.response?.data?.detail || t('status.not_found')))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token])

  async function onSent() {
    setBusy(true)
    setError('')
    try {
      await api.post('/payments/etransfer-notify', { token, sender_name: senderName.trim() || null })
      setSent(true)
    } catch (e) {
      setError(e?.response?.data?.detail || t('surveyConfirm.err.notify'))
      setBusy(false)
    }
  }

  return (
    <QuoteShell>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('surveyConfirm.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('surveyConfirm.subtitle')}
        </p>

        {loading ? <div className="mt-4 text-sm text-slate-600">{t('status.loading')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {status?.survey_scheduled_date ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('surveyConfirm.scheduled')}</div>
            <div className="mt-1 text-slate-800">{new Date(status.survey_scheduled_date).toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">
              {t('surveyConfirm.deposit_status', {
                state: status.survey_deposit_paid ? t('surveyConfirm.deposit_paid') : t('surveyConfirm.deposit_unpaid'),
              })}
            </div>
          </div>
        ) : null}

        {status?.survey_deposit_paid ? (
          <div className="mt-5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('surveyConfirm.pay_paid')}</div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{t('surveyConfirm.method')}</div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-slate-600">{t('surveyConfirm.recipient')}</div>
                  <div className="text-right font-semibold text-slate-900">{info?.recipient_name || '—'}</div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="text-slate-600">{t('surveyConfirm.email')}</div>
                  <div className="text-right font-semibold text-slate-900">{info?.recipient_email || '—'}</div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="text-slate-600">{t('surveyConfirm.amount')}</div>
                  <div className="text-right font-semibold text-slate-900">${Number(info?.amount ?? status?.survey_deposit_amount ?? 0).toFixed(2)}</div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="text-slate-600">{t('surveyConfirm.message')}</div>
                  <div className="text-right font-semibold text-slate-900">
                    {t('surveyConfirm.message_hint', { ref: info?.reference_number || status?.reference_number || '—' })}
                  </div>
                </div>
                {info?.instructions ? <div className="mt-1 text-xs text-slate-500">{info.instructions}</div> : null}
              </div>
            </div>

            <label className="mt-3 block">
              <div className="text-sm font-medium text-slate-800">{t('surveyConfirm.sender_name')}</div>
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                placeholder={t('surveyConfirm.sender_name_ph')}
              />
            </label>

            {sent ? (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('surveyConfirm.sent_done')}</div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onSent}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
              >
                {t('surveyConfirm.sent')}
              </button>
            )}
          </>
        )}

        <div className="mt-3 text-xs text-slate-500">
          {t('surveyConfirm.note')}
        </div>

        <div className="mt-4">
          <Link to={`/quote/status/${token}`} className="text-sm font-semibold text-slate-700 underline">
            {t('quoteView.back_status')}
          </Link>
        </div>
      </div>
    </QuoteShell>
  )
}

