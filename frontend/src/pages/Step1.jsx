import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { useI18n } from '../i18n/index.js'

function normalizePhone(raw) {
  const digits = (raw || '').replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return raw
}

export default function Step1() {
  const { t } = useI18n()
  const nav = useNavigate()
  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('quoteDraft') || '{}')
    } catch {
      return {}
    }
  }, [])

  const [nickname, setNickname] = useState(saved?.customer?.nickname || '')
  const [phone, setPhone] = useState(saved?.customer?.phone || '')
  const [error, setError] = useState('')

  function onNext(e) {
    e.preventDefault()
    setError('')

    const n = nickname.trim()
    const p = normalizePhone(phone.trim())
    const digits = p.replace(/[^\d]/g, '')

    if (!n) return setError(t('step1.err.nickname'))
    if (!(digits.length === 11 && digits.startsWith('1'))) return setError(t('step1.err.phone'))

    const draft = { ...saved, customer: { ...(saved.customer || {}), nickname: n, phone: p } }
    sessionStorage.setItem('quoteDraft', JSON.stringify(draft))
    nav('/quote/step2')
  }

  return (
    <QuoteShell>
      <div className="mb-4 text-sm text-slate-600">{t('step.progress', { n: 1, total: 2 })}</div>
      <form onSubmit={onNext} className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('step1.title')}</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step1.nickname')}</div>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder={t('step1.nickname_ph')}
              required
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step1.phone')}</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder={t('step1.phone_ph')}
              required
            />
          </label>
          {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        </div>

        <button
          type="submit"
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          {t('common.next')}
        </button>
      </form>
    </QuoteShell>
  )
}

