import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { PlacesAddressInput } from '../components/PlacesAddressInput.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

export default function Step2() {
  const { t } = useI18n()
  const nav = useNavigate()
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('quoteDraft') || '{}')
    } catch {
      return {}
    }
  }, [])

  const [brands, setBrands] = useState([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [chargerBrand, setChargerBrand] = useState(draft?.charger_brand || '')
  const [evBrand, setEvBrand] = useState(draft?.ev_brand || '')
  const [email, setEmail] = useState(draft?.customer?.email || '')
  const [installAddress, setInstallAddress] = useState(draft?.install_address || '')
  const [pickupDate, setPickupDate] = useState(draft?.pickup_date || '')
  const [preferredInstallDate, setPreferredInstallDate] = useState(draft?.preferred_install_date || '')
  const [referrer, setReferrer] = useState(draft?.referrer || '')
  const [notes, setNotes] = useState(draft?.notes || '')
  const [slots, setSlots] = useState(draft?.preferred_survey_slots?.slots || [])

  useEffect(() => {
    let alive = true
    setLoadingBrands(true)
    api
      .get('/charger-brands')
      .then((res) => {
        if (!alive) return
        setBrands(res.data || [])
        if (!chargerBrand && res.data?.length) setChargerBrand(res.data[0].name)
      })
      .catch(() => {})
      .finally(() => alive && setLoadingBrands(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    if (!draft?.customer?.nickname || !draft?.customer?.phone) {
      nav('/quote/step1')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        customer: {
          nickname: draft.customer.nickname,
          phone: draft.customer.phone,
          email: email.trim(),
        },
        charger_brand: chargerBrand,
        ev_brand: evBrand.trim(),
        install_address: installAddress.trim(),
        pickup_date: pickupDate || null,
        preferred_install_date: preferredInstallDate || null,
        referrer: referrer.trim() || null,
        preferred_survey_slots: { slots },
        notes: notes.trim() || null,
      }

      const res = await api.post('/cases', payload)
      sessionStorage.removeItem('quoteDraft')
      sessionStorage.setItem('lastCaseToken', res.data.access_token)
      nav('/quote/submitted', { state: res.data })
    } catch (e2) {
      setError(e2?.response?.data?.detail || t('step2.err.submit'))
    } finally {
      setSubmitting(false)
    }
  }

  function toggleSlot(id) {
    setSlots((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <QuoteShell>
      <div className="mb-4 text-sm text-slate-600">{t('step.progress', { n: 2, total: 2 })}</div>
      <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('step2.title')}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.charger_brand')}</div>
            <select
              disabled={loadingBrands}
              value={chargerBrand}
              onChange={(e) => setChargerBrand(e.target.value)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60"
              required
            >
              {brands.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.ev_brand')}</div>
            <input
              value={evBrand}
              onChange={(e) => setEvBrand(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder={t('step2.ev_brand_ph')}
              required
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.email')}</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder={t('step2.email_ph')}
              required
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.address')}</div>
            <PlacesAddressInput
              value={installAddress}
              onChange={setInstallAddress}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder={t('step2.address_ph')}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('step2.pickup_date')}</div>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium text-slate-800">{t('step2.preferred_completion')}</div>
              <input
                type="date"
                value={preferredInstallDate}
                onChange={(e) => setPreferredInstallDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              />
            </label>
          </div>

          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.referrer')}</div>
            <input
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder={t('step2.referrer_ph')}
            />
          </label>

          <div className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.slots')}</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {[
                { id: 'morning', label: t('slots.morning') },
                { id: 'afternoon', label: t('slots.afternoon') },
                { id: 'evening', label: t('slots.evening') },
              ].map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={slots.includes(opt.id)}
                    onChange={() => toggleSlot(opt.id)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="text-sm font-medium text-slate-800">{t('step2.notes')}</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              rows={4}
              placeholder={t('step2.notes_ph')}
            />
          </label>

          {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? t('step2.submitting') : t('step2.submit')}
        </button>
      </form>
    </QuoteShell>
  )
}

