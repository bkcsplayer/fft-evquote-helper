import { Link, useLocation } from 'react-router-dom'
import { QuoteShell } from '../components/layout/QuoteShell.jsx'
import { useI18n } from '../i18n/index.js'

export default function Submitted() {
  const { t } = useI18n()
  const loc = useLocation()
  const data = loc.state || null

  const token = data?.access_token || sessionStorage.getItem('lastCaseToken') || ''
  const reference = data?.reference_number || '—'

  return (
    <QuoteShell>
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">{t('submitted.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('submitted.subtitle')}
        </p>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{t('submitted.case_ref')}</div>
          <div className="mt-1 font-semibold text-slate-900">{reference}</div>
        </div>

        <div className="mt-4">
          <Link
            to={token ? `/quote/status/${token}` : '/quote'}
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
          >
            {t('submitted.track')}
          </Link>
        </div>

        <div className="mt-3 text-center text-xs text-slate-500">
          {t('submitted.note')}
        </div>
      </div>
    </QuoteShell>
  )
}

