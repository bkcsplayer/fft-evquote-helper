import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

function money(v, locale) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(locale || 'en-CA', { style: 'currency', currency: 'CAD' })
}

export default function QuoteView() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const [quote, setQuote] = useState(null)
  const [surveyPhotos, setSurveyPhotos] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null) // { src, title, subtitle }

  useEffect(() => {
    let alive = true
    Promise.all([api.get(`/quotes/view/${token}`), api.get(`/cases/survey/photos/${token}`)])
      .then(([q, photos]) => {
        if (!alive) return
        setQuote(q.data)
        setSurveyPhotos(photos.data || [])
      })
      .catch((e) => alive && setError(e?.response?.data?.detail || t('quoteView.not_found')))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token])

  useEffect(() => {
    if (!preview) return
    const onKey = (e) => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  return (
    <QuoteShell>
      <ImageModal
        open={!!preview}
        onClose={() => setPreview(null)}
        src={preview?.src}
        title={preview?.title}
        subtitle={preview?.subtitle}
      />
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('quoteView.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('quoteView.subtitle')}</p>

        {loading ? <div className="mt-4 text-sm text-slate-600">{t('status.loading')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {quote ? (
          <>
            {quote.signature ? (
              <div className="mt-4 rounded-xl border bg-emerald-50 p-3 text-sm">
                <div className="font-semibold text-emerald-800">{t('quoteView.approved')}</div>
                <div className="mt-1 text-emerald-800">
                  {t('quoteView.signed_by', { name: quote.signature.signed_name })}
                </div>
                <div className="mt-1 text-xs text-emerald-700">
                  {t('quoteView.signed_at', { dt: new Date(quote.signature.signed_at).toLocaleString(locale) })}
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

            <div className="mt-4 divide-y rounded-xl border">
              <Row label={t('quoteView.install_type')} value={quote.install_type} />
              <Row label={t('quoteView.base_price')} value={money(quote.base_price, locale)} />
              <Row
                label={t('quoteView.extra_distance')}
                value={`${quote.extra_distance_meters} m × ${money(quote.extra_distance_rate, locale)} = ${money(quote.extra_distance_cost, locale)}`}
              />
              {Number(quote.permit_fee) > 0 ? <Row label={t('quoteView.permit_fee')} value={money(quote.permit_fee, locale)} /> : null}
              {Number(quote.survey_credit) > 0 ? (
                <Row
                  label={t('quoteView.survey_credit')}
                  value={`- ${money(quote.survey_credit, locale)}`}
                />
              ) : null}
              {(quote.addons || []).map((a) => (
                <Row key={a.id} label={a.name} value={money(a.price, locale)} />
              ))}
              <Row label={t('quoteView.subtotal')} value={money(quote.subtotal, locale)} bold />
              <Row label={`GST (${quote.gst_rate}%)`} value={money(quote.gst_amount, locale)} />
              <Row label={t('quoteView.total')} value={money(quote.total, locale)} bold />
            </div>
            {Number(quote.permit_fee) === 0 ? (
              <div className="mt-2 text-xs text-slate-500">{t('quoteApprove.base_sub')}</div>
            ) : null}

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{t('quoteView.photos.title')}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {t('quoteView.photos.body')}
                  </div>
                </div>
              </div>
              {surveyPhotos.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {surveyPhotos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPreview({
                          src: `/${p.file_path}`,
                          title: p.file_name || t('quoteView.photos.title'),
                          subtitle: p.caption || p.category,
                        })
                      }
                      className="overflow-hidden rounded-xl border bg-white"
                      title={t('quoteView.photos.preview_hint')}
                    >
                      <img src={`/${p.file_path}`} alt={p.file_name} className="h-28 w-full object-cover" />
                      <div className="px-2 py-1 text-left text-xs text-slate-600">
                        <span className="font-semibold">{p.category}</span>
                        {p.caption ? <span className="text-slate-500"> · {p.caption}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-600">{t('quoteView.photos.empty')}</div>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              {!quote.signature ? (
                <Link
                  to={`/quote/approve/${token}`}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
                >
                  {t('quoteView.approve')}
                </Link>
              ) : null}
              <Link
                to={`/quote/status/${token}`}
                className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${
                  quote.signature ? 'bg-slate-900 text-white hover:bg-slate-800' : 'border bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                {quote.signature ? t('quoteView.view_status') : t('quoteView.back_status')}
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </QuoteShell>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <div className={`text-slate-600 ${bold ? 'font-semibold' : ''}`}>{label}</div>
      <div className={`text-right text-slate-900 ${bold ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  )
}

function ImageModal({ open, onClose, src, title, subtitle }) {
  const { t } = useI18n()
  const closeRef = useRef(null)
  useEffect(() => {
    if (open && closeRef.current) closeRef.current.focus()
  }, [open])
  if (!open) return null
  const heading = title || t('common.preview')
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative mx-auto flex h-full max-w-2xl items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-modal-title"
          className="w-full overflow-hidden rounded-2xl border bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div id="image-modal-title" className="truncate text-sm font-semibold text-slate-900">{heading}</div>
              {subtitle ? <div className="truncate text-xs text-slate-600">{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {src ? (
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {t('common.open')}
                </a>
              ) : null}
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
          <div className="bg-slate-900/5 p-3">
            {src ? (
              <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl border bg-white p-2">
                <img src={src} alt={heading} className="max-h-[70vh] w-auto max-w-full object-contain" />
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">{t('common.no_preview')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

