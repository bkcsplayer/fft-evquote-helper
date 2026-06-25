// Centralized tone -> Tailwind class maps.
//
// Single source of truth for every tonal surface (pills, bars, dots, row accents, tints).
// Tailwind JIT requires literal class strings, so all variants are spelled out here rather
// than built with `bg-${tone}-500` templates. Tone semantics live in caseStatus.js.

export const TONES = ['slate', 'teal', 'amber', 'emerald', 'rose', 'indigo']

const PILL = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/10',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/10',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
}

const BAR = {
  slate: 'bg-slate-400',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
}

// Solid left accent bar for rows / cards.
const ACCENT = {
  slate: 'bg-slate-300',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
}

// Faint full-row background tint (paired with the accent bar).
const ROW_TINT = {
  slate: 'bg-slate-50/40',
  teal: 'bg-teal-50/40',
  amber: 'bg-amber-50/40',
  emerald: 'bg-emerald-50/30',
  rose: 'bg-rose-50/30',
  indigo: 'bg-indigo-50/30',
}

const TEXT = {
  slate: 'text-slate-600',
  teal: 'text-teal-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  indigo: 'text-indigo-700',
}

// Left edge accent for table rows (paired with border-l-4 on the first cell).
const BORDER_L = {
  slate: 'border-l-slate-300',
  teal: 'border-l-teal-500',
  amber: 'border-l-amber-500',
  emerald: 'border-l-emerald-500',
  rose: 'border-l-rose-500',
  indigo: 'border-l-indigo-500',
}

export const pillClass = (tone) => PILL[tone] || PILL.slate
export const barClass = (tone) => BAR[tone] || BAR.slate
export const dotClass = (tone) => BAR[tone] || BAR.slate
export const accentClass = (tone) => ACCENT[tone] || ACCENT.slate
export const rowTintClass = (tone) => ROW_TINT[tone] || ''
export const textClass = (tone) => TEXT[tone] || TEXT.slate
export const borderLeftClass = (tone) => BORDER_L[tone] || BORDER_L.slate
