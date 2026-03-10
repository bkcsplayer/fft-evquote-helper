import { Link } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { useI18n } from '../i18n/index.js'

export default function Welcome() {
  const { t } = useI18n()
  return (
    <QuoteShell>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('welcome.kicker')}</div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">
          {t('welcome.title')
            .split('\n')
            .map((line, idx) => (
              <span key={idx}>
                {line}
                {idx === 0 ? <br /> : null}
              </span>
            ))}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {t('welcome.subtitle')}
        </p>
        <div className="mt-5">
          <Link
            to="/quote/step1"
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
          >
            {t('welcome.cta')}
          </Link>
        </div>
        <div className="mt-3 text-center text-xs text-slate-500">
          {t('welcome.note')}
        </div>
      </div>
    </QuoteShell>
  )
}

