export function Pill({ tone = 'slate', className = '', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
    teal: 'bg-teal-100 text-teal-800',
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tones[tone] || tones.slate} ${className}`}>
      {children}
    </span>
  )
}

export function PillButton({ active, tone = 'slate', className = '', children, ...props }) {
  const activeTones = {
    slate: 'bg-slate-900 border-slate-900 text-white',
    emerald: 'bg-emerald-700 border-emerald-700 text-white',
    amber: 'bg-amber-600 border-amber-600 text-white',
    teal: 'bg-teal-700 border-teal-700 text-white',
    rose: 'bg-rose-700 border-rose-700 text-white',
  }

  const base = 'rounded-full border px-3 py-1 text-xs font-semibold'
  const inactive = 'bg-white text-slate-700 hover:bg-slate-50'
  const on = activeTones[tone] || activeTones.slate

  return (
    <button type="button" className={`${base} ${active ? on : inactive} ${className}`} {...props}>
      {children}
    </button>
  )
}

