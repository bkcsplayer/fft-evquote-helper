// Shared surface primitives so cards/section headers stop being copy-pasted across pages.

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}

export function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</p>
        ) : null}
        {title ? <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
