import { useI18n } from '../i18n/index.js'

const ORDER = [
  'pending', 'survey_scheduled', 'survey_completed', 'quoting', 'quoted',
  'customer_approved', 'permit_applied', 'permit_approved', 'installation_scheduled', 'installed', 'completed',
]
const idx = (s) => ORDER.indexOf(s)

const STAGES = [
  { key: 'request', labelKey: 'stage.request', start: 'pending', end: 'pending' },
  { key: 'survey', labelKey: 'stage.survey', start: 'survey_scheduled', end: 'survey_completed' },
  { key: 'quote', labelKey: 'stage.quote', start: 'quoting', end: 'customer_approved' },
  { key: 'permit', labelKey: 'stage.permit', start: 'permit_applied', end: 'permit_approved' },
  { key: 'install', labelKey: 'stage.install', start: 'installation_scheduled', end: 'installed' },
  { key: 'done', labelKey: 'stage.done', start: 'completed', end: 'completed' },
]

const STATE_CLS = {
  done: 'border-emerald-200 bg-emerald-50',
  current: 'flow-glow border-teal-400 bg-teal-50',
  upcoming: 'border-slate-200 bg-white',
}

function Check() {
  return (
    <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// details: optional map stageKey -> short sub-line text (already localized by the caller).
export function StageFlow({ status, details = {} }) {
  const { t } = useI18n()
  const cur = idx(status)
  const terminal = status === 'cancelled' || status === 'lost'

  return (
    <div>
      {terminal ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
          {t('stage.stopped', { state: status })}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {STAGES.map((st) => {
          const endIdx = idx(st.end)
          const startIdx = idx(st.start)
          let state = 'upcoming'
          if (!terminal) {
            if (cur > endIdx) state = 'done'
            else if (cur >= startIdx) state = 'current'
          }
          const sub = details[st.key]
          return (
            <div key={st.key} className={`rounded-xl border p-3 transition-colors ${STATE_CLS[state]}`}>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-semibold ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-800'}`}>{t(st.labelKey)}</span>
                {state === 'done' ? <Check /> : state === 'current' ? <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" /> : null}
              </div>
              <div className={`mt-1 text-[11px] leading-snug ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-600'}`}>
                {sub || t(`stage.state.${state}`)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
