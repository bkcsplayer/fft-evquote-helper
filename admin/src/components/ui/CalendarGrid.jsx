import { Link } from 'react-router-dom'

function startOfDayLocal(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDayLocal(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function startOfWeekMonday(d) {
  const x = startOfDayLocal(d)
  const dow = x.getDay() // 0=Sun .. 6=Sat
  const delta = (dow + 6) % 7 // Mon=0 .. Sun=6
  x.setDate(x.getDate() - delta)
  return x
}

function endOfWeekSunday(d) {
  const x = startOfWeekMonday(d)
  x.setDate(x.getDate() + 6)
  return endOfDayLocal(x)
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

function fmtDow(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function eventCardClass(tone) {
  switch (tone) {
    case 'teal':
      return 'border-teal-200 bg-teal-50 hover:bg-teal-100'
    case 'amber':
      return 'border-amber-200 bg-amber-50 hover:bg-amber-100'
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
    case 'rose':
      return 'border-rose-200 bg-rose-50 hover:bg-rose-100'
    case 'indigo':
      return 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
    default:
      return 'border-slate-200 bg-slate-50 hover:bg-slate-100'
  }
}

export function CalendarGrid({ start, end, events, emptyMessage = 'No events.' }) {
  const s = startOfWeekMonday(start)
  const e = endOfWeekSunday(end)

  const days = []
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }

  const items = Array.isArray(events) ? events : []
  const byDay = days.map((day) => {
    const rows = items
      .filter((ev) => ev?.start instanceof Date && sameLocalDay(ev.start, day))
      .sort((a, b) => a.start - b.start)
    return { day, rows }
  })

  const any = byDay.some((x) => x.rows.length > 0)
  if (!any) {
    return <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{emptyMessage}</div>
  }

  const weeks = []
  for (let i = 0; i < byDay.length; i += 7) {
    weeks.push(byDay.slice(i, i + 7))
  }

  return (
    <div className="overflow-auto rounded-2xl border bg-white shadow-sm">
      <div className="min-w-[56rem]">
        {weeks.map((week, idx) => (
          <div key={idx} className={`${idx === 0 ? '' : 'border-t'} grid grid-cols-7`}>
            {week.map(({ day, rows }) => (
              <div key={day.toISOString()} className="border-r last:border-r-0">
                <div className="sticky top-0 z-10 border-b bg-white px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{fmtDow(day)}</div>
                  <div className="text-sm font-semibold text-slate-900">{fmtDate(day)}</div>
                </div>
                <div className="space-y-2 px-3 py-3">
                  {rows.length === 0 ? <div className="text-xs text-slate-400">—</div> : null}
                  {rows.map((ev) => (
                    <Link
                      key={ev.id}
                      to={ev.href}
                      className={`block rounded-xl border px-3 py-2 text-sm ${eventCardClass(ev?.tone)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-700">{fmtTime(ev.start)}</div>
                        {ev.pill ? ev.pill : null}
                      </div>
                      <div className="mt-1 font-medium text-slate-900">{ev.title}</div>
                      {ev.subtitle ? <div className="mt-1 text-xs text-slate-500">{ev.subtitle}</div> : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

