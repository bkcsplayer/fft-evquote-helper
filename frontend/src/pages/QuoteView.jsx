import { useEffect, useState } from 'react'
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
  const { t, lang } = useI18n()
  const [quote, setQuote] = useState(null)
  const [surveyPhotos, setSurveyPhotos] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null) // { src, title, subtitle }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
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
                  {t('quoteView.signed_at', { dt: new Date(quote.signature.signed_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA') })}
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
              <Row label={t('quoteView.base_price')} value={money(quote.base_price, lang === 'zh' ? 'zh-CN' : 'en-CA')} />
              <Row
                label={t('quoteView.extra_distance')}
                value={`${quote.extra_distance_meters} m × ${money(quote.extra_distance_rate, lang === 'zh' ? 'zh-CN' : 'en-CA')} = ${money(
                  quote.extra_distance_cost,
                  lang === 'zh' ? 'zh-CN' : 'en-CA',
                )}`}
              />
              <Row label={t('quoteView.permit_fee')} value={money(quote.permit_fee, lang === 'zh' ? 'zh-CN' : 'en-CA')} />
              {Number(quote.survey_credit) > 0 ? (
                <Row
                  label={t('quoteView.survey_credit')}
                  value={`- ${money(quote.survey_credit, lang === 'zh' ? 'zh-CN' : 'en-CA')}`}
                />
              ) : null}
              {(quote.addons || []).map((a) => (
                <Row key={a.id} label={a.name} value={money(a.price, lang === 'zh' ? 'zh-CN' : 'en-CA')} />
              ))}
              <Row label={t('quoteView.subtotal')} value={money(quote.subtotal, lang === 'zh' ? 'zh-CN' : 'en-CA')} bold />
              <Row label={`GST (${quote.gst_rate}%)`} value={money(quote.gst_amount, lang === 'zh' ? 'zh-CN' : 'en-CA')} />
              <Row label={t('quoteView.total')} value={money(quote.total, lang === 'zh' ? 'zh-CN' : 'en-CA')} bold />
            </div>

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{lang === 'zh' ? 'Site survey 照片' : 'Site survey photos'}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {lang === 'zh' ? '以下为现场勘测拍摄的照片，用于确认安装方案。' : 'Photos taken during the site survey to confirm the install plan.'}
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
                          title: p.file_name || 'Survey photo',
                          subtitle: p.caption || p.category,
                        })
                      }
                      className="overflow-hidden rounded-xl border bg-white"
                      title={lang === 'zh' ? '点击放大预览' : 'Click to preview'}
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
                <div className="mt-3 text-sm text-slate-600">{lang === 'zh' ? '暂无照片。' : 'No photos yet.'}</div>
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
                {quote.signature ? (lang === 'zh' ? '查看状态' : 'View status') : t('quoteView.back_status')}
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
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close preview" onClick={onClose} />
      <div className="relative mx-auto flex h-full max-w-2xl items-center justify-center p-4">
        <div className="w-full overflow-hidden rounded-2xl border bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{title || 'Preview'}</div>
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
                  Open
                </a>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
          <div className="bg-slate-900/5 p-3">
            {src ? (
              <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl border bg-white p-2">
                <img src={src} alt={title || 'Preview'} className="max-h-[70vh] w-auto max-w-full object-contain" />
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">No preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

