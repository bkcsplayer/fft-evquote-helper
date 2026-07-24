import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../../components/layout/QuoteShell.jsx'
import { SignaturePad } from '../../components/SignaturePad.jsx'
import { api } from '../../services/api.js'
import { useI18n } from '../../i18n/index.js'

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD' })
}

export default function BirdQuoteApprove() {
  const { token } = useParams()
  const { t, locale } = useI18n()
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
      .get(`/public/services/bird-netting/quote/${token}`)
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
  }, [token])

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

  return (
    <QuoteShell>
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.bird.quote.title')}</h2>

        {loading ? <div className="mt-4 text-sm text-slate-600">{t('svc.status.loading')}</div> : null}
        {notReady ? <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{t('svc.bird.quote.not_ready')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {quote ? (
          <>
            <div className="mt-4 divide-y rounded-xl border text-sm">
              <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.bird.quote.rolls')}</span><span className="font-semibold text-slate-900">{quote.roll_count}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.bird.quote.nests')}</span><span className="font-semibold text-slate-900">{quote.nest_count}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="font-bold text-slate-900">{t('svc.bird.quote.total')}</span><span className="font-bold text-slate-900">{money(quote.total, locale)}</span></div>
            </div>

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
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
                  <span>{t('svc.common.disclaimer_agree')}</span>
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
                  <div className="mt-1"><SignaturePad ref={padRef} onInkChange={setHasInk} /></div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-slate-500">{hasInk ? t('quoteApprove.sig_captured') : t('quoteApprove.sig_hint')}</div>
                    <button type="button" onClick={() => padRef.current?.clear()} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {t('quoteApprove.clear')}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={onApprove}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busy ? t('quoteApprove.submit_busy') : t('svc.bird.quote.approve')}
                </button>
              </>
            )}
          </>
        ) : null}
      </div>
    </QuoteShell>
  )
}
