import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { SignaturePad } from '../components/SignaturePad.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD' })
}

function BRow({ label, sub, value, bold }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <div>
        <div className={bold ? 'font-semibold text-slate-900' : 'text-slate-600'}>{label}</div>
        {sub ? <div className="text-xs text-slate-400">{sub}</div> : null}
      </div>
      <div className={`text-right ${bold ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</div>
    </div>
  )
}

export default function QuoteApprove() {
  const { token } = useParams()
  const { t, lang, locale } = useI18n()
  const [agreed, setAgreed] = useState(false)
  const [signedName, setSignedName] = useState('')
  const padRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [loadingQuote, setLoadingQuote] = useState(true)
  const [approvedAlready, setApprovedAlready] = useState(false)

  const TERMS = [
    { title: t('quoteApprove.term1.title'), body: t('quoteApprove.term1.body') },
    { title: t('quoteApprove.term2.title'), body: t('quoteApprove.term2.body') },
    { title: t('quoteApprove.term3.title'), body: t('quoteApprove.term3.body') },
    { title: t('quoteApprove.term4.title'), body: t('quoteApprove.term4.body') },
  ]

  useEffect(() => {
    let alive = true
    setLoadingQuote(true)
    setError('')
    api
      .get(`/quotes/view/${token}`)
      .then((res) => {
        if (!alive) return
        setQuote(res.data)
        if (res.data?.signature) {
          setApprovedAlready(true)
          setDone(true)
          setSignedName(res.data.signature.signed_name || '')
        }
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.response?.data?.detail || t('quoteView.not_found'))
      })
      .finally(() => alive && setLoadingQuote(false))
    return () => {
      alive = false
    }
  }, [token])

  async function onApprove() {
    setError('')
    const name = signedName.trim()
    if (quote?.signature) return setError(t('quoteApprove.already'))
    if (!agreed) return setError(t('quoteApprove.err.agree'))
    if (!name) return setError(t('quoteApprove.err.name'))
    if (!hasInk) return setError(t('quoteApprove.err.ink'))

    setBusy(true)
    try {
      const signatureDataUrl = padRef.current?.getDataUrl() || ''
      // Snapshot the exact terms the customer read, in the language they chose (audit trail).
      const termsText = TERMS.map((term) => `${term.title}\n${term.body}`).join('\n\n')
      const res = await api.post(`/quotes/approve/${token}`, {
        agreed: true,
        signed_name: name,
        signature_data: signatureDataUrl,
        language: lang,
        terms_text: termsText,
      })
      setQuote(res.data)
      setDone(true)
    } catch (e) {
      setError(e?.response?.data?.detail || t('quoteApprove.err.submit'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QuoteShell>
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('quoteApprove.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('quoteApprove.subtitle')}</p>

        {loadingQuote ? <div className="mt-4 text-sm text-slate-600">{t('status.loading')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {quote ? (
          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-900">{t('quoteApprove.summary_title')}</div>
            <div className="mt-2 divide-y rounded-xl border text-sm">
              <BRow label={t('quoteView.base_price')} sub={Number(quote.permit_fee) > 0 ? `${t('quoteView.install_type')}: ${quote.install_type}` : t('quoteApprove.base_sub')} value={money(quote.base_price, locale)} />
              {Number(quote.extra_distance_cost) > 0 ? (
                <BRow label={t('quoteView.extra_distance')} sub={`${quote.extra_distance_meters} m × ${money(quote.extra_distance_rate, locale)}`} value={money(quote.extra_distance_cost, locale)} />
              ) : null}
              {Number(quote.permit_fee) > 0 ? (
                <BRow label={t('quoteView.permit_fee')} sub={t('quoteApprove.permit_sub')} value={money(quote.permit_fee, locale)} />
              ) : null}
              {Number(quote.survey_credit) > 0 ? (
                <BRow label={t('quoteView.survey_credit')} value={`- ${money(quote.survey_credit, locale)}`} />
              ) : null}
              {(quote.addons || []).map((a) => (
                <BRow key={a.id} label={a.name} value={money(a.price, locale)} />
              ))}
              <BRow label={t('quoteView.subtotal')} value={money(quote.subtotal, locale)} bold />
              <BRow label={`GST (${quote.gst_rate}%)`} value={money(quote.gst_amount, locale)} />
              <BRow label={t('quoteView.total')} value={money(quote.total, locale)} bold />
            </div>
            <div className="mt-2 text-xs text-slate-500">{t('quoteApprove.summary_hint')}</div>
          </div>
        ) : null}

        {quote ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="text-sm font-semibold text-slate-900">{t('quote.includes_title')}</div>
            <ul className="mt-2 space-y-1">
              {t('quote.includes_list').split('\n').map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {done ? (
          <>
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {approvedAlready ? t('quoteApprove.already') : t('quoteApprove.done')}
            </div>
            {quote?.signature ? (
              <div className="mt-3 rounded-xl border bg-white p-3 text-sm">
                <div className="font-semibold text-slate-900">{t('quoteView.approved')}</div>
                <div className="mt-1 text-slate-700">{t('quoteView.signed_by', { name: quote.signature.signed_name })}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {t('quoteView.signed_at', {
                    dt: new Date(quote.signature.signed_at).toLocaleString(locale),
                  })}
                </div>
                {String(quote.signature.signature_data || '').startsWith('data:image') ? (
                  <img
                    alt="Signature"
                    src={quote.signature.signature_data}
                    className="mt-2 max-h-40 w-full rounded-xl border bg-white object-contain"
                  />
                ) : null}
              </div>
            ) : null}
            <div className="mt-4">
              <Link
                to={`/quote/status/${token}`}
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                {t('quoteApprove.back_status')}
              </Link>
            </div>
            <div className="mt-3">
              <Link to={`/quote/view/${token}`} className="text-sm font-semibold text-slate-700 underline">
                {t('quoteApprove.back_quote')}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {TERMS.map((term) => (
                <div key={term.title} className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-900">{term.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-700">{term.body}</div>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-700"
              />
              <span>{t('quoteApprove.agree')}</span>
            </label>

            <label className="mt-3 block">
              <div className="text-sm font-medium text-slate-800">{t('quoteApprove.signature_name')}</div>
              <input
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder={t('quoteApprove.signature_name_ph')}
              />
            </label>

            <div className="mt-3">
              <div className="text-sm font-medium text-slate-800">{t('quoteApprove.draw')}</div>
              <div className="mt-1">
                <SignaturePad ref={padRef} onInkChange={setHasInk} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">{hasInk ? t('quoteApprove.sig_captured') : t('quoteApprove.sig_hint')}</div>
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('quoteApprove.clear')}
                </button>
              </div>
            </div>

            {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

            <button
              type="button"
              disabled={busy || !!quote?.signature}
              onClick={onApprove}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            >
              {busy ? t('quoteApprove.submit_busy') : t('quoteApprove.submit')}
            </button>

            <div className="mt-3">
              <Link to={`/quote/view/${token}`} className="text-sm font-semibold text-slate-700 underline">
                {t('quoteApprove.back_quote')}
              </Link>
            </div>
          </>
        )}
      </div>
    </QuoteShell>
  )
}

