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
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('submitted.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('submitted.subtitle')}
        </p>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{t('submitted.case_ref')}</div>
          <div className="mt-1 font-semibold text-slate-900">{reference}</div>
        </div>

        <div className="mt-4">
          <Link
            to={token ? `/quote/status/${token}` : '/quote'}
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
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

