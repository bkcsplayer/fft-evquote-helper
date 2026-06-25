import { pillClass } from '../../utils/tone.js'

export function Pill({ tone = 'slate', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pillClass(tone)} ${className}`}
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
