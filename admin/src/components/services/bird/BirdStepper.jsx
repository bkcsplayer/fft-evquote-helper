// Six-step progress bar for a bird-netting booking (UI contract v1 lines 50–52, 402–409).
const STEPS = ['Survey booked', 'Surveyed', 'Quoted', 'Approved', 'Install scheduled', 'Completed']
const INDEX = { submitted: 0, survey_scheduled: 0, surveyed: 1, quoted: 2, approved: 3, install_scheduled: 4, completed: 5 }

function birdStepIndex(status) {
  return INDEX[status] ?? 0
}

export function BirdStepper({ status }) {
  const i = birdStepIndex(status)
  const allDone = status === 'completed'
  return (
    <nav aria-label="Progress" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <ol className="grid grid-cols-3 gap-y-3 sm:grid-cols-6">
        {STEPS.map((t, k) => {
          const done = k < i || allDone
          const cur = k === i && !allDone
          // contrast fix (whitelisted colour tweak): upcoming text slate-600/500 instead of slate-400
          const dot = done ? 'bg-emerald-600 text-white' : cur ? 'bg-white text-emerald-700 ring-2 ring-emerald-600' : 'bg-slate-100 text-slate-600'
          return (
            <li key={t} className="flex flex-col items-center text-center" aria-current={cur ? 'step' : undefined}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${dot}`} aria-hidden="true">
                {done ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                ) : k + 1}
              </span>
              <span className={`mt-1 text-xs ${cur ? 'font-bold text-slate-900' : done ? 'text-slate-700' : 'text-slate-500'}`}>
                {t}
                <span className="sr-only">{done ? ' (completed)' : cur ? ' (current step)' : ' (upcoming)'}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
