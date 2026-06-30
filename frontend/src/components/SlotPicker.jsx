import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

function dayKey(iso) { return iso.slice(0, 10) }
function fmtDay(dayStr) {
  const d = new Date(dayStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Slot-based booking: lists available times for a kind and books the chosen one. */
export function SlotPicker({ token, kind, onBooked }) {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selDay, setSelDay] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let on = true
    setLoading(true)
    api
      .get(`/cases/${token}/slots`, { params: { kind } })
      .then((r) => {
        if (!on) return
        const s = r.data?.slots || []
        setSlots(s)
        setSelDay(s.length ? dayKey(s[0]) : null)
      })
      .catch((e) => on && setErr(e?.response?.data?.detail || 'Could not load times.'))
      .finally(() => on && setLoading(false))
    return () => { on = false }
  }, [token, kind])

  const days = [...new Set(slots.map(dayKey))]
  const daySlots = slots.filter((s) => dayKey(s) === selDay)

  async function book(startAt) {
    setBusy(true)
    setErr('')
    try {
      await api.post(`/cases/${token}/book`, { kind, start_at: startAt })
      onBooked?.()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That time was just taken. Please pick another.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="py-3 text-sm text-slate-400">Loading available times…</div>
  if (!slots.length)
    return <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">No times available right now — please check back soon.</div>

  return (
    <div>
      {err && <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setSelDay(d)}
            className={`flex-shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${
              selDay === d ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {fmtDay(d)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {daySlots.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => book(s)}
            className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"
          >
            {fmtHour(s)}
          </button>
        ))}
      </div>
    </div>
  )
}
