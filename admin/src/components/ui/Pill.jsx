export function Pill({ tone = 'slate', className = '', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-600/10',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
    rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    teal: 'bg-teal-50 text-teal-700 ring-teal-600/10',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
  }

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.slate} ${className}`}
    >
      {children}
    </span>
  )
}

export function PillButton({ active, tone = 'slate', className = '', children, ...props }) {
  const activeTones = {
    slate: 'bg-slate-900 border-slate-900 text-white shadow-sm',
    emerald: 'bg-emerald-600 border-emerald-600 text-white shadow-sm',
    amber: 'bg-amber-500 border-amber-500 text-white shadow-sm',
    teal: 'bg-teal-600 border-teal-600 text-white shadow-sm',
    rose: 'bg-rose-600 border-rose-600 text-white shadow-sm',
  }

  const base = 'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150'
  const inactive = 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'

  return (
    <button
      type="button"
      className={`${base} ${active ? (activeTones[tone] || activeTones.slate) : inactive} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
