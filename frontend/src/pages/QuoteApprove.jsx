import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

export default function QuoteApprove() {
  const { token } = useParams()
  const { t, lang } = useI18n()
  const [agreed, setAgreed] = useState(false)
  const [signedName, setSignedName] = useState('')
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
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

  function resizeCanvas() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(280, Math.floor(rect.width))
    const cssH = 140
    const dpr = window.devicePixelRatio || 1

    // Preserve existing drawing when possible
    const old = document.createElement('canvas')
    old.width = canvas.width
    old.height = canvas.height
    const oldCtx = old.getContext('2d')
    oldCtx.drawImage(canvas, 0, 0)

    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.2

    // redraw scaled-ish (best-effort)
    if (old.width && old.height) {
      ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    resizeCanvas()
    const onResize = () => resizeCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function getCanvasPoint(e) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function attachDrawingHandlers() {
    const canvas = canvasRef.current
    if (!canvas) return () => {}
    const ctx = canvas.getContext('2d')
    let drawing = false
    let last = null

    function start(e) {
      e.preventDefault()
      drawing = true
      last = getCanvasPoint(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
    }
    function move(e) {
      if (!drawing) return
      e.preventDefault()
      const p = getCanvasPoint(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
      setHasInk(true)
    }
    function end() {
      drawing = false
      last = null
    }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)

    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
  }

  useEffect(() => {
    return attachDrawingHandlers()
  }, [])

  async function onApprove() {
    setError('')
    const name = signedName.trim()
    if (quote?.signature) return setError(t('quoteApprove.already'))
    if (!agreed) return setError(t('quoteApprove.err.agree'))
    if (!name) return setError(t('quoteApprove.err.name'))
    if (!hasInk) return setError(t('quoteApprove.err.ink'))

    setBusy(true)
    try {
      const canvas = canvasRef.current
      const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : ''
      const res = await api.post(`/quotes/approve/${token}`, {
        agreed: true,
        signed_name: name,
        signature_data: signatureDataUrl,
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
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('quoteApprove.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('quoteApprove.subtitle')}</p>

        {loadingQuote ? <div className="mt-4 text-sm text-slate-600">{t('status.loading')}</div> : null}
        {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

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
                    dt: new Date(quote.signature.signed_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-CA'),
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
                className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800"
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
              {TERMS.map((t) => (
                <div key={t.title} className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-700">{t.body}</div>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 accent-teal-700"
              />
              <span>{t('quoteApprove.agree')}</span>
            </label>

            <label className="mt-3 block">
              <div className="text-sm font-medium text-slate-800">{t('quoteApprove.signature_name')}</div>
              <input
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                placeholder={t('quoteApprove.signature_name_ph')}
              />
            </label>

            <div className="mt-3">
              <div className="text-sm font-medium text-slate-800">{t('quoteApprove.draw')}</div>
              <div ref={wrapRef} className="mt-1 rounded-xl border bg-white p-2">
                <canvas
                  ref={canvasRef}
                  className="block w-full touch-none"
                  aria-label="Signature pad"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">{hasInk ? t('quoteApprove.sig_captured') : t('quoteApprove.sig_hint')}</div>
                <button
                  type="button"
                  onClick={clearSignature}
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
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
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

