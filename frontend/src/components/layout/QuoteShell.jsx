import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/index.js'

export function QuoteShell({ children }) {
  const { t, lang, toggle } = useI18n()
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Link to="/quote" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-900">
            <img src="/brand-logo.png" alt="FFT" className="h-6 w-6 rounded-md bg-slate-900/5 object-contain" />
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
            <a className="text-sm text-slate-600" href="tel:+14030000000">
              {t('app.call')}
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  )
}

