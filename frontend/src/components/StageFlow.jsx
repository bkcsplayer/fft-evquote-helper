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
  current: 'flow-glow border-emerald-400 bg-emerald-50',
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
      <div className="flex items-start">
        {STAGES.map((st, i) => {
          const endIdx = idx(st.end)
          const startIdx = idx(st.start)
          let state = 'upcoming'
          if (!terminal) {
            if (cur > endIdx) state = 'done'
            else if (cur >= startIdx) state = 'current'
          }
          return (
            <div key={st.key} className="relative flex flex-1 flex-col items-center gap-2">
              {i < STAGES.length - 1 ? (
                <span className={`absolute left-1/2 top-[5px] h-[2px] w-full ${state === 'done' ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
              ) : null}
              <span
                className={`relative z-10 h-3 w-3 rounded-full ${
                  state === 'done'
                    ? 'bg-zinc-900'
                    : state === 'current'
                      ? 'bg-emerald-600 ring-4 ring-emerald-100'
                      : 'bg-zinc-200'
                }`}
              />
              <span className={`text-[10.5px] font-bold tracking-tight ${state === 'upcoming' ? 'text-zinc-400' : 'text-zinc-900'}`}>{t(st.labelKey)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
