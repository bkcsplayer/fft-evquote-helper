import { StatusTag } from './StatusTag.jsx'
import { Pill } from './Pill.jsx'
import { stageStates, nextAction, ballInCourt } from '../../utils/caseStatus.js'

function money(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return null
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

const STEP_CLS = {
  done: 'border-emerald-200 bg-emerald-50',
  current: 'border-slate-900 bg-slate-900 text-white flow-glow',
  upcoming: 'border-slate-200 bg-slate-50 opacity-70',
}
const STEP_SUB = {
  done: 'text-emerald-600',
  current: 'text-emerald-200',
  upcoming: 'text-slate-400',
}
const STEP_SUB_LABEL = { done: 'Done', current: 'In progress', upcoming: '—' }

const BALL_TONE = {
  amber: 'text-amber-700',
  sky: 'text-emerald-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-600',
  slate: 'text-slate-700',
}

/**
 * Always-on case header: a 6-stage pipeline (current stage marked with a flowing-light border)
 * plus a 4-cell summary — current stage / next action / payment / who the case is waiting on.
 */
export function CaseFlowHeader({ data, installation, onGoTo }) {
  if (!data) return null
  const stages = stageStates(data.status)
  const na = nextAction(data, installation)
  const ball = ballInCourt(data, installation)
  const depositAmt = money(data.survey_deposit_amount)

  return (
    <div className="mt-5 space-y-3">
      {/* Pipeline stepper */}
      <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-3xl border border-zinc-100 bg-white p-2 shadow-sm">
        {stages.map((st) => (
          <div key={st.key} className={`relative min-w-[96px] flex-1 rounded-xl border px-3 py-2.5 ${STEP_CLS[st.state]}`}>
            <div className="text-[11px] font-semibold">{st.label}</div>
            <div className={`mt-0.5 text-[10px] font-medium ${STEP_SUB[st.state]}`}>{STEP_SUB_LABEL[st.state]}</div>
          </div>
        ))}
      </div>

      {/* 4-cell summary */}
      <div className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-700" />
        <div className="grid grid-cols-2 divide-slate-200 lg:grid-cols-4 lg:divide-x">
          {/* Current stage */}
          <div className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current stage</div>
            <div className="mt-2"><StatusTag status={data.status} /></div>
          </div>

          {/* Next action */}
          <div className="border-t border-slate-200 p-4 lg:border-t-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Next action</div>
            {na?.done ? (
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {na.label}
              </div>
            ) : na?.dead ? (
              <div className="mt-2 text-sm font-semibold text-rose-600">{na.label}</div>
            ) : na?.wait ? (
              <div className="mt-2 text-sm font-semibold text-amber-700">{na.label}</div>
            ) : (
              <button
                type="button"
                onClick={() => na?.tab && onGoTo?.(na.tab)}
                className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-800 active:scale-95"
              >
                {na?.label}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>
            )}
          </div>

          {/* Payment */}
          <div className="border-t border-slate-200 p-4 lg:border-t-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment</div>
            <div className="mt-2 flex items-center gap-2">
              <Pill tone={data.survey_deposit_paid ? 'emerald' : 'slate'}>{data.survey_deposit_paid ? 'Deposit paid' : 'Deposit unpaid'}</Pill>
              {depositAmt && <span className="text-sm text-slate-500">{depositAmt}</span>}
            </div>
          </div>

          {/* Waiting on */}
          <div className="border-t border-slate-200 p-4 lg:border-t-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Waiting on</div>
            <div className={`mt-2 text-lg font-bold ${BALL_TONE[ball.tone] || 'text-slate-700'}`}>{ball.who}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
