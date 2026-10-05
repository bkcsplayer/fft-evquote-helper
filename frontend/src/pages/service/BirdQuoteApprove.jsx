import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { QuoteShell } from '../../components/layout/QuoteShell.jsx'
import { SignaturePad } from '../../components/SignaturePad.jsx'
import { api } from '../../services/api.js'
import { useI18n } from '../../i18n/index.js'
import { fmtCalgaryDay } from '../../utils/calgaryTime.js'
import { renderBold } from '../../utils/renderBold.jsx'

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }) // zh-CN would print "CA$"
}

export default function BirdQuoteApprove() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const [params] = useSearchParams()
  const preview = params.get('preview')
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notReady, setNotReady] = useState(false)
  const [error, setError] = useState('')

  const [agreed, setAgreed] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const padRef = useRef(null)
  const [busy, setBusy] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    setNotReady(false)
    return api
      .get(`/public/services/bird-netting/quote/${token}`, { params: preview ? { preview } : undefined })
      .then((res) => setQuote(res.data))
      .catch((e) => {
        if (e?.response?.status === 404 && /no quote yet/i.test(e?.response?.data?.detail || '')) {
          setNotReady(true)
        } else {
          setError(e?.response?.data?.detail || t('svc.bird.quote.not_found'))
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, preview])

  async function onApprove() {
    setError('')
    const name = signedName.trim()
    if (quote?.status === 'approved') return
    if (!agreed) return setError(t('quoteApprove.err.agree'))
    if (!name) return setError(t('quoteApprove.err.name'))
    if (!hasInk) return setError(t('quoteApprove.err.ink'))

    setBusy(true)
    try {
      const signatureDataUrl = padRef.current?.getDataUrl() || ''
      await api.post(`/public/services/bird-netting/quote/${token}/approve`, {
        signature_data: signatureDataUrl,
        signed_name: name,
      })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || t('quoteApprove.err.submit'))
    } finally {
      setBusy(false)
    }
  }

  const approved = quote?.status === 'approved'
  const isPreview = Boolean(quote?.preview)
  const m = (v) => money(v, locale)
  const row = 'flex justify-between px-3 py-2.5'

  return (
    <QuoteShell>
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        {isPreview ? (
          <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{t('svc.bird.quote.preview_banner')}</div>
        ) : null}
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.bird.quote.title')}</h2>
        {quote ? <div className="mt-0.5 text-xs text-slate-500">Ref {quote.reference_number}</div> : null}

        {loading ? <div className="mt-4 text-sm text-slate-600">{t('svc.status.loading')}</div> : null}
        {notReady ? <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{t('svc.bird.quote.not_ready')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {quote ? (
          <>
            {quote.survey ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('svc.bird.quote.measured')}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('svc.bird.quote.perimeter')}</div><b className="text-base">{quote.survey.perimeter_ft} {t('svc.bird.quote.ft')}</b></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('svc.bird.quote.nests_found')}</div><b className="text-base">{quote.survey.nest_count}</b></div>
                </div>
                {(quote.survey.photo_urls || []).length ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {quote.survey.photo_urls.map((url, i) => (
                      <img key={url} src={url} alt={t('svc.bird.quote.photo_alt', { n: i + 1 })} loading="lazy" className="h-24 w-32 shrink-0 rounded-xl object-cover" />
                    ))}
                  </div>
                ) : null}
                {quote.survey.surveyed_at ? <p className="mt-1 text-xs text-slate-500">{t('svc.bird.quote.photos_caption', { day: fmtCalgaryDay(quote.survey.surveyed_at) })}</p> : null}
              </div>
            ) : null}

            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              <div className={row}><span>{t('svc.bird.quote.netting_line', { n: quote.roll_count, price: m(quote.roll_price) })}</span><span>{m(quote.roll_count * quote.roll_price)}</span></div>
              {quote.nest_count > 0 ? (
                <div className={row}><span>{t('svc.bird.quote.nest_line', { n: quote.nest_count, price: m(quote.nest_fee) })}</span><span>{m(quote.nest_count * quote.nest_fee)}</span></div>
              ) : null}
              {quote.gst_amount > 0 ? (
                <>
                  <div className={`${row} text-slate-600`}><span>{t('svc.bird.quote.subtotal')}</span><span>{m(quote.subtotal)}</span></div>
                  <div className={`${row} text-slate-600`}><span>{t('svc.bird.quote.gst', { rate: Number(quote.gst_rate) })}</span><span>{m(quote.gst_amount)}</span></div>
                </>
              ) : null}
              <div className={`${row} bg-slate-50 text-base font-bold`}><span>{t('svc.bird.quote.total')}</span><span>{m(quote.total)}</span></div>
            </div>
            {quote.deposit_amount != null ? (
              <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                {renderBold(t('svc.bird.quote.deposit_box', { deposit: m(quote.deposit_amount) }))}<br />
                {renderBold(t('svc.bird.quote.balance_box', { balance: m(quote.balance_amount) }))}
              </div>
            ) : null}

            {approved ? (
              <>
                <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('svc.bird.quote.approved')}</div>
                <div className="mt-4">
                  <Link
                    to={`/service/status/${token}`}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    {t('svc.bird.quote.back_status')}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <label className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm">
                  <input type="checkbox" disabled={isPreview} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
                  <span>{t('svc.common.disclaimer_agree')}</span>
                </label>

                <label className="mt-3 block">
                  <div className="text-sm font-medium text-slate-800">{t('quoteApprove.signature_name')}</div>
                  <input
                    value={signedName}
                    disabled={isPreview}
                    onChange={(e) => setSignedName(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder={t('quoteApprove.signature_name_ph')}
                  />
                </label>

                <div className="mt-3">
                  <div className="text-sm font-medium text-slate-800">{t('quoteApprove.draw')}</div>
                  <div className={`mt-1 ${isPreview ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={isPreview || undefined} inert={isPreview || undefined}><SignaturePad ref={padRef} onInkChange={setHasInk} /></div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-slate-500">{hasInk ? t('quoteApprove.sig_captured') : t('quoteApprove.sig_hint')}</div>
                    <button type="button" disabled={isPreview} onClick={() => padRef.current?.clear()} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {t('quoteApprove.clear')}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || isPreview}
                  onClick={onApprove}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busy ? t('quoteApprove.submit_busy') : t('svc.bird.quote.approve')}
                </button>
                {isPreview ? <p className="mt-1 text-center text-xs font-medium text-amber-800">{t('svc.bird.quote.preview_sign_disabled')}</p> : null}
              </>
            )}
            <p className="mt-3 text-center text-xs text-slate-500">{t('svc.bird.quote.warranty')}</p>
          </>
        ) : null}
      </div>
    </QuoteShell>
  )
}
