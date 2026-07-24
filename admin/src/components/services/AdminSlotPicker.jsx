import { useEffect, useState } from 'react'
import { api } from '../../services/api.js'

function dayKey(iso) { return iso.slice(0, 10) }
function fmtDay(dayStr) {
  const d = new Date(dayStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Admin-side shared-pool slot picker (diagnostic schedule, bird install schedule, cleaning visit
 * schedule) — reads the same public, kind-agnostic capacity feed customers see. Select-only:
 * caller submits the chosen ISO string with its own action.
 */
export function AdminSlotPicker({ value, onChange }) {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selDay, setSelDay] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let on = true
    setLoading(true)
    api
      .get('/public/services/slots', { baseURL: '/api/v1' })
      .then((r) => {
        if (!on) return
        const s = r.data?.slots || []
        setSlots(s)
        setSelDay(s.length ? dayKey(value && s.includes(value) ? value : s[0]) : null)
      })
      .catch(() => on && setErr('Could not load times.'))
      .finally(() => on && setLoading(false))
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const days = [...new Set(slots.map(dayKey))]
  const daySlots = slots.filter((s) => dayKey(s) === selDay)

  if (loading) return <div className="py-2 text-sm text-slate-400">Loading available times…</div>
  if (!slots.length) return <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">No times available right now.</div>

  return (
    <div>
      {err && <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setSelDay(d)}
            className={`flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              selDay === d ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {fmtDay(d)}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {daySlots.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange?.(s)}
            className={`rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
              value === s
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-500 hover:bg-emerald-50'
            }`}
          >
            {fmtHour(s)}
          </button>
        ))}
      </div>
    </div>
  )
}
