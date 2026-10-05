import { fmtCalgaryDay } from '../../../utils/calgaryTime.js'

// Read-only survey result (UI contract v1 lines 122–134).
export function SurveySummaryCard({ b }) {
  if (!b.survey) return null
  const s = b.survey
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Survey result · {fmtCalgaryDay(b.surveyed_at)}</div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>Done
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-xs text-slate-500">Perimeter</div><b>{s.perimeter_ft} ft</b></div>
        <div><div className="text-xs text-slate-500">Nests</div><b>{s.nest_count}</b></div>
        <div><div className="text-xs text-slate-500">Photos</div><b>{(s.photo_urls || []).length}</b></div>
      </div>
      {s.notes ? <p className="mt-2 text-sm text-slate-600">{s.notes}</p> : null}
    </section>
  )
}
