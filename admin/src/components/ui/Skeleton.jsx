export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse-soft rounded-lg bg-slate-200 ${className}`} />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <Skeleton className="mb-3 h-4 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="mb-2 h-3 w-full" style={{ maxWidth: `${85 - i * 10}%` }} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b bg-slate-50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonKpi() {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="h-7 w-20" />
    </div>
  )
}
