import { fmtCalgaryShort } from '../../../utils/calgaryTime.js'
import { money } from '../../../utils/birdMoney.js'

// Read-only sent quote (UI contract v1 lines 177–190).
export function QuoteSummaryCard({ b }) {
  const q = b.quote
  if (!q) return null
  const signed = q.status === 'approved'
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quote{q.sent_at ? ` · sent ${fmtCalgaryShort(q.sent_at)}` : ''}</div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${signed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{signed ? 'Signed' : 'Awaiting signature'}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-xs text-slate-500">Rolls</div><b>{q.roll_count}</b></div>
        <div><div className="text-xs text-slate-500">Nests</div><b>{q.nest_count}</b></div>
        <div><div className="text-xs text-slate-500">{Number(q.gst_amount) > 0 ? 'Total (incl. GST)' : 'Total'}</div><b>{money(q.total)}</b></div>
        <div><div className="text-xs text-slate-500">Deposit 30%</div><b>{money(q.deposit_amount)}</b></div>
      </div>
      {signed ? (
        <div className="mt-2 text-sm text-slate-600">Signed by <b>{q.signed_name}</b>{q.approved_at ? ` · ${fmtCalgaryShort(q.approved_at)}` : ''}</div>
      ) : null}
    </section>
  )
}
