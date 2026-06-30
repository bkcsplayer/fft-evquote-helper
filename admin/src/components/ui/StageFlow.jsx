import { CASE_STATUS_ORDER, statusLabel } from '../../utils/caseStatus.js'

// Lifecycle stages mapped to a [start, end] window in CASE_STATUS_ORDER.
const STAGES = [
  { key: 'request', label: 'Request', start: 'pending', end: 'pending' },
  { key: 'survey', label: 'Survey', start: 'survey_scheduled', end: 'survey_completed' },
  { key: 'quote', label: 'Quote', start: 'quoting', end: 'customer_approved' },
  { key: 'permit', label: 'Permit', start: 'permit_applied', end: 'permit_approved' },
  { key: 'install', label: 'Install', start: 'installation_scheduled', end: 'installed' },
  { key: 'done', label: 'Completed', start: 'completed', end: 'completed' },
]

const idx = (s) => CASE_STATUS_ORDER.indexOf(s)

const STATE_CLS = {
  done: 'border-emerald-200 bg-emerald-50',
  current: 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300',
  upcoming: 'border-slate-200 bg-white',
}

function Check() {
  return (
    <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// `details` is an optional map of stage key -> short sub-line (e.g. permit status).
export function StageFlow({ status, details = {} }) {
  const cur = idx(status)
  const terminal = status === 'cancelled' || status === 'lost'

  return (
    <div>
      {terminal ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
          This case is {statusLabel(status)} — the workflow is stopped.
        </div>
      ) : null}
      <div className="flex flex-wrap items-stretch gap-2">
        {STAGES.map((st, i) => {
          const endIdx = idx(st.end)
          const startIdx = idx(st.start)
          let state = 'upcoming'
          if (!terminal) {
            if (cur > endIdx) state = 'done'
            else if (cur >= startIdx) state = 'current'
          }
          const sub = details[st.key]
          return (
            <div key={st.key} className="flex flex-1 items-stretch gap-2">
              <div className={`min-w-[120px] flex-1 rounded-xl border p-3 transition-colors ${STATE_CLS[state]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-700'}`}>{st.label}</span>
                  {state === 'done' ? <Check /> : state === 'current' ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> : null}
                </div>
                <div className={`mt-1 text-xs ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-600'}`}>
                  {sub || (state === 'done' ? 'Done' : state === 'current' ? 'In progress' : 'Upcoming')}
                </div>
              </div>
              {i < STAGES.length - 1 ? (
                <div className="hidden items-center text-slate-300 md:flex">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
