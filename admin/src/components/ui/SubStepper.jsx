/**
 * Compact sub-step progress inside a stage tab. Each step is a chip; the current step gets the
 * same flowing-light border as the top stage stepper. steps: [{ label, state }] where
 * state is 'done' | 'current' | 'upcoming'.
 */
export function SubStepper({ steps = [] }) {
  if (!steps.length) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span
            className={`relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
              s.state === 'done'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : s.state === 'current'
                  ? 'flow-glow border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            {s.state === 'done' && (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            )}
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          )}
        </span>
      ))}
    </div>
  )
}
