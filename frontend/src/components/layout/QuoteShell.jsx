import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/index.js'
import { api } from '../../services/api.js'

export function QuoteShell({ children }) {
  const { t, lang, toggle } = useI18n()
  // Single source: logo + support phone come from admin Settings (brand_profile) via /branding.
  const [brand, setBrand] = useState(null)
  useEffect(() => {
    let on = true
    api.get('/branding').then((r) => { if (on) setBrand(r.data) }).catch(() => {})
    return () => { on = false }
  }, [])
  const logo = brand?.logo_url || '/brand-logo.png'
  const phone = brand?.support_phone || '+14030000000'
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Link to="/quote" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-900">
            <img src={logo} alt={brand?.brand_short || 'FFT'} className="h-6 w-6 rounded-md bg-slate-900/5 object-contain" />
            <span>{t('app.brand')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="Language"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <a className="text-sm text-slate-600" href={`tel:${phone}`}>
              {t('app.call')}
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  )
}
