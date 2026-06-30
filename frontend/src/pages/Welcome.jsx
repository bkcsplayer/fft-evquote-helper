import { Link } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { useI18n } from '../i18n/index.js'

export default function Welcome() {
  const { t } = useI18n()
  return (
    <QuoteShell>
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('welcome.kicker')}</div>
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
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
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

