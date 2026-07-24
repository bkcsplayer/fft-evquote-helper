import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'
import evChargerImg from '../assets/services/ev-charger.svg'
import diagnosticImg from '../assets/services/solar-diagnostic.svg'
import birdNettingImg from '../assets/services/bird-netting.svg'
import cleaningImg from '../assets/services/panel-cleaning.svg'

function ServiceCard({ to, image, name, tagline, priceLabel }) {
  return (
    <Link
      to={to}
      className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm transition-colors hover:border-emerald-300 hover:shadow-md"
    >
      <img src={image} alt="" className="aspect-[5/4] w-full object-cover" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="text-sm font-bold leading-tight text-slate-900">{name}</div>
        <p className="line-clamp-2 flex-1 text-xs leading-snug text-slate-500">{tagline}</p>
        <span className="mt-1 inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition-colors group-hover:bg-emerald-100">
          {priceLabel}
        </span>
      </div>
    </Link>
  )
}

export default function ServicesHome() {
  const { t } = useI18n()
  const [pricing, setPricing] = useState(null)

  useEffect(() => {
    let on = true
    api.get('/public/service-pricing').then((r) => { if (on) setPricing(r.data) }).catch(() => {})
    return () => { on = false }
  }, [])

  const cards = [
    {
      to: '/quote',
      image: evChargerImg,
      name: t('home.card.ev.name'),
      tagline: t('home.card.ev.tagline'),
      priceLabel: t('home.card.ev.from'),
    },
    {
      to: '/service/diagnostic',
      image: diagnosticImg,
      name: t('home.card.diagnostic.name'),
      tagline: t('home.card.diagnostic.tagline'),
      priceLabel: t('home.card.diagnostic.from', { price: pricing?.diagnostic_hourly_rate ?? 179 }),
    },
    {
      to: '/service/bird-netting',
      image: birdNettingImg,
      name: t('home.card.bird.name'),
      tagline: t('home.card.bird.tagline'),
      priceLabel: t('home.card.bird.from', { price: pricing?.bird_netting_roll_price ?? 599 }),
    },
    {
      to: '/service/cleaning',
      image: cleaningImg,
      name: t('home.card.cleaning.name'),
      tagline: t('home.card.cleaning.tagline'),
      priceLabel: t('home.card.cleaning.from', { price: pricing?.cleaning_tier1_price ?? 599 }),
    },
  ]

  return (
    <QuoteShell>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('home.kicker')}</div>
      <h1 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">{t('home.title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('home.subtitle')}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <ServiceCard key={c.to} {...c} />
        ))}
      </div>
    </QuoteShell>
  )
}
