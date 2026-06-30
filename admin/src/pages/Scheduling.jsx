import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'

const card = 'overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm'
const cardHead = 'border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-700'
const input = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
const btn = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-95 disabled:opacity-60'
const btnP = 'inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 active:scale-95 disabled:opacity-60'
const btnD = 'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // index = weekday (Mon=0)

function fmt(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function Scheduling() {
  const [config, setConfig] = useState(null)
  const [area, setArea] = useState(null)
  const [overrides, setOverrides] = useState([])
  const [bookings, setBookings] = useState([])
  const [ovDay, setOvDay] = useState('')
  const [ovHour, setOvHour] = useState('')
  const [ovCap, setOvCap] = useState('0')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  async function loadAll() {
    const [c, a, o, b] = await Promise.all([
      api.get('/booking-config'),
      api.get('/service-area'),
      api.get('/availability-overrides'),
      api.get('/bookings'),
    ])
    setConfig(c.data); setArea(a.data); setOverrides(o.data || []); setBookings(b.data || [])
  }
  useEffect(() => { loadAll().catch((e) => flash(e?.response?.data?.detail || 'Load failed')) }, [])

  async function saveConfig() {
    setBusy(true)
    try { const r = await api.put('/booking-config', { value: config }); setConfig(r.data); flash('Booking config saved.') }
    catch (e) { flash(e?.response?.data?.detail || 'Save failed') } finally { setBusy(false) }
  }
  async function saveArea() {
    setBusy(true)
    try { const r = await api.put('/service-area', { value: area }); setArea(r.data); flash('Service area saved.') }
    catch (e) { flash(e?.response?.data?.detail || 'Save failed') } finally { setBusy(false) }
  }
  async function addOverride() {
    if (!ovDay) return
    setBusy(true)
    try {
      await api.post('/availability-overrides', { day: ovDay, hour: ovHour === '' ? null : Number(ovHour), capacity: Number(ovCap) })
      const o = await api.get('/availability-overrides'); setOverrides(o.data || [])
      flash('Override saved.')
    } catch (e) { flash(e?.response?.data?.detail || 'Save failed') } finally { setBusy(false) }
  }
  async function delOverride(id) {
    setBusy(true)
    try { await api.delete(`/availability-overrides/${id}`); setOverrides((p) => p.filter((x) => x.id !== id)) }
    catch (e) { flash(e?.response?.data?.detail || 'Delete failed') } finally { setBusy(false) }
  }
  async function cancelBooking(id) {
    setBusy(true)
    try { await api.post(`/bookings/${id}/cancel`); setBookings((p) => p.filter((x) => x.id !== id)); flash('Booking cancelled.') }
    catch (e) { flash(e?.response?.data?.detail || 'Cancel failed') } finally { setBusy(false) }
  }

  function setC(k, v) { setConfig((p) => ({ ...p, [k]: v })) }
  function toggleWeekday(i) {
    setConfig((p) => {
      const cur = new Set(p.working_weekdays || [])
      cur.has(i) ? cur.delete(i) : cur.add(i)
      return { ...p, working_weekdays: [...cur].sort((a, b) => a - b) }
    })
  }
  function setRegion(idx, patch) {
    setArea((p) => ({ ...p, regions: p.regions.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }))
  }
  function addRegion() {
    setArea((p) => ({ ...p, regions: [...(p.regions || []), { name: 'New region', enabled: false, fsa_prefixes: [], cities: [] }] }))
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Scheduling</h1>
          {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">{msg}</div>}
        </div>

        {/* Service area */}
        {area && (
          <div className={card}>
            <div className={cardHead}>Service area — who can book</div>
            <div className="space-y-3 p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" checked={!!area.master_enabled} onChange={(e) => setArea((p) => ({ ...p, master_enabled: e.target.checked }))} className="h-4 w-4" />
                Accept bookings (master switch)
              </label>
              {(area.regions || []).map((r, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={!!r.enabled} onChange={(e) => setRegion(i, { enabled: e.target.checked })} className="h-4 w-4" />
                      <input value={r.name} onChange={(e) => setRegion(i, { name: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">FSA prefixes (comma)
                      <input value={(r.fsa_prefixes || []).join(', ')} onChange={(e) => setRegion(i, { fsa_prefixes: e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) })} className={input} placeholder="T1Y, T2, T3" />
                    </label>
                    <label className="text-xs text-slate-500">Cities (comma)
                      <input value={(r.cities || []).join(', ')} onChange={(e) => setRegion(i, { cities: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={input} placeholder="Calgary" />
                    </label>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button className={btn} onClick={addRegion}>+ Add region</button>
                <button className={btnP} disabled={busy} onClick={saveArea}>Save service area</button>
              </div>
            </div>
          </div>
        )}

        {/* Availability & capacity */}
        {config && (
          <div className={card}>
            <div className={cardHead}>Availability &amp; capacity</div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lead days (earliest)
                  <input type="number" value={config.lead_days} onChange={(e) => setC('lead_days', Number(e.target.value))} className={input} /></label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Horizon days (furthest)
                  <input type="number" value={config.horizon_days} onChange={(e) => setC('horizon_days', Number(e.target.value))} className={input} /></label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Default capacity / slot
                  <input type="number" value={config.default_capacity} onChange={(e) => setC('default_capacity', Number(e.target.value))} className={input} /></label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Day start hour
                  <input type="number" value={config.day_start_hour} onChange={(e) => setC('day_start_hour', Number(e.target.value))} className={input} /></label>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Day end hour
                  <input type="number" value={config.day_end_hour} onChange={(e) => setC('day_end_hour', Number(e.target.value))} className={input} /></label>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Working days</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DOW.map((d, i) => (
                    <label key={i} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${(config.working_weekdays || []).includes(i) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-400'}`}>
                      <input type="checkbox" checked={(config.working_weekdays || []).includes(i)} onChange={() => toggleWeekday(i)} className="h-3.5 w-3.5" />{d}
                    </label>
                  ))}
                </div>
              </div>
              <button className={btnP} disabled={busy} onClick={saveConfig}>Save config</button>
            </div>
          </div>
        )}

        {/* Day overrides */}
        <div className={card}>
          <div className={cardHead}>Close or extend specific slots</div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-500">Day<input type="date" value={ovDay} onChange={(e) => setOvDay(e.target.value)} className={input} /></label>
              <label className="text-xs font-semibold text-slate-500">Hour (blank = whole day)<input type="number" value={ovHour} onChange={(e) => setOvHour(e.target.value)} className={input} placeholder="e.g. 14" /></label>
              <label className="text-xs font-semibold text-slate-500">Capacity (0 = closed)<input type="number" value={ovCap} onChange={(e) => setOvCap(e.target.value)} className={input} /></label>
              <button className={btnP} disabled={busy || !ovDay} onClick={addOverride}>Save override</button>
            </div>
            <div className="space-y-1.5">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <div>{o.day} · {o.hour == null ? 'whole day' : `${o.hour}:00`} · capacity <b>{o.capacity}</b> {o.capacity === 0 && <span className="text-rose-600">(closed)</span>}</div>
                  <button className={btnD} onClick={() => delOverride(o.id)}>Remove</button>
                </div>
              ))}
              {overrides.length === 0 && <div className="py-2 text-xs text-slate-400">No overrides — all slots use the default capacity.</div>}
            </div>
          </div>
        </div>

        {/* Bookings */}
        <div className={card}>
          <div className={cardHead}>Upcoming bookings</div>
          <div className="space-y-1.5 p-5">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div><b>{b.reference_number || b.case_id}</b> · {b.customer || '—'} · <span className="font-semibold text-emerald-700">{b.kind}</span></div>
                <div className="text-slate-500">{fmt(b.start_at)}</div>
                <button className={btnD} onClick={() => cancelBooking(b.id)}>Cancel</button>
              </div>
            ))}
            {bookings.length === 0 && <div className="py-2 text-xs text-slate-400">No upcoming bookings.</div>}
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
