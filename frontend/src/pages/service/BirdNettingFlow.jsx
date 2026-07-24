import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QuoteShell } from '../../components/layout/QuoteShell.jsx'
import { PlacesAddressInput } from '../../components/PlacesAddressInput.jsx'
import { ServiceSlotPicker } from '../../components/ServiceSlotPicker.jsx'
import { PhotoUpload } from '../../components/PhotoUpload.jsx'
import { DisclaimerBlock } from '../../components/DisclaimerBlock.jsx'
import { api } from '../../services/api.js'
import { useI18n } from '../../i18n/index.js'

export default function BirdNettingFlow() {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [pricing, setPricing] = useState(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [panelCount, setPanelCount] = useState('')
  const [photos, setPhotos] = useState([])
  const [slot, setSlot] = useState(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    let on = true
    api.get('/public/service-pricing').then((r) => { if (on) setPricing(r.data) }).catch(() => {})
    return () => { on = false }
  }, [])

  const rollPrice = pricing?.bird_netting_roll_price ?? 599
  const nestFee = pricing?.bird_netting_nest_fee ?? 99

  function validateStep1() {
    if (!name.trim() || !phone.trim() || !email.trim() || !address.trim() || !panelCount) return t('step2.err.submit')
    if (!slot) return t('svc.common.err_slot')
    return ''
  }

  async function onSubmit() {
    setError('')
    const v = validateStep1()
    if (v) return setError(v)
    if (!accepted) return setError(t('svc.common.disclaimer_err'))

    setSubmitting(true)
    try {
      const res = await api.post('/public/services/bookings', {
        service_type: 'bird_netting',
        customer_name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        panel_count: Number(panelCount),
        start_at: slot,
        disclaimer_accepted: true,
        photo_urls: photos,
      })
      setSubmitted(res.data)
    } catch (e) {
      setError(e?.response?.data?.detail || t('svc.common.err_submit'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <QuoteShell>
        <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.common.submitted_title')}</h2>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('submitted.case_ref')}</div>
            <div className="mt-1 font-semibold text-slate-900">{submitted.reference}</div>
          </div>
          <div className="mt-4">
            <Link
              to={`/service/status/${submitted.token}`}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              {t('svc.common.track_status')}
            </Link>
          </div>
          <div className="mt-3 text-center text-xs text-slate-500">{t('svc.common.submitted_note')}</div>
        </div>
      </QuoteShell>
    )
  }

  return (
    <QuoteShell>
      <div className="mb-4 text-sm text-slate-600">{t('step.progress', { n: step + 1, total: 3 })}</div>

      {step === 0 ? (
        <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.bird.intro_title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('svc.bird.intro_body')}</p>

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="text-sm font-semibold text-slate-900">{t('svc.bird.intro_price_title')}</div>
            <p className="mt-1 text-sm text-slate-700">{t('svc.bird.intro_price_body', { roll: rollPrice, nest: nestFee })}</p>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-900">{t('svc.bird.intro_how_title')}</div>
            <ol className="mt-2 space-y-1.5">
              {[t('svc.bird.intro_how_1'), t('svc.bird.intro_how_2'), t('svc.bird.intro_how_3'), t('svc.bird.intro_how_4')].map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
          >
            {t('svc.bird.cta')}
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.bird.intro_title')}</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.name')}</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder={t('svc.common.name_ph')} required />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.phone')}</div>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder={t('svc.common.phone_ph')} required />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.email')}</div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder={t('svc.common.email_ph')} required />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.address')}</div>
              <PlacesAddressInput value={address} onChange={setAddress} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder={t('svc.common.address_ph')} required />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.panel_count')}</div>
              <input type="number" min="1" inputMode="numeric" value={panelCount} onChange={(e) => setPanelCount(e.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-600" placeholder={t('svc.common.panel_count_ph')} required />
            </label>

            <div className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.common.photos_optional')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('svc.common.photos_hint')}</div>
              <div className="mt-2"><PhotoUpload urls={photos} onChange={setPhotos} /></div>
            </div>

            <div className="block">
              <div className="text-sm font-medium text-slate-800">{t('svc.bird.survey_time')}</div>
              <div className="mt-2"><ServiceSlotPicker value={slot} onChange={setSlot} /></div>
            </div>

            {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('svc.common.back')}</button>
            <button
              type="button"
              onClick={() => { const v = validateStep1(); if (v) return setError(v); setError(''); setStep(2) }}
              className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('svc.common.summary')}</h2>
          <div className="mt-3 divide-y rounded-xl border text-sm">
            <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.common.name')}</span><span className="font-semibold text-slate-900">{name}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.common.address')}</span><span className="text-right font-semibold text-slate-900">{address}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.common.panel_count')}</span><span className="font-semibold text-slate-900">{panelCount}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-slate-600">{t('svc.bird.survey_time')}</span><span className="font-semibold text-slate-900">{slot ? new Date(slot).toLocaleString() : '—'}</span></div>
          </div>
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{t('svc.bird.pricing_formula', { rollPrice, nestFee })}</div>

          <DisclaimerBlock text={t('svc.bird.disclaimer')} accepted={accepted} onChange={setAccepted} />

          {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('svc.common.back')}</button>
            <button
              type="button"
              disabled={submitting}
              onClick={onSubmit}
              className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            >
              {submitting ? t('svc.common.submitting') : t('svc.common.submit')}
            </button>
          </div>
        </div>
      ) : null}
    </QuoteShell>
  )
}
