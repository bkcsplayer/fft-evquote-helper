import { useState } from 'react'
import { AdminSlotPicker } from '../AdminSlotPicker.jsx'
import { api } from '../../../services/api.js'
import { fmtCalgary } from '../../../utils/calgaryTime.js'

const field = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
const errText = 'mt-1 block text-xs font-medium text-rose-700'

// Stage ① — drone survey: reschedule + record the survey result (UI contract v1 lines 75–120).
export function SurveyStageCard({ b, reload }) {
  const s = b.survey
  const [slot, setSlot] = useState(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleMsg, setRescheduleMsg] = useState('')

  const [ft, setFt] = useState(s ? String(s.perimeter_ft ?? '') : '')
  const [nests, setNests] = useState(s ? String(s.nest_count ?? '') : '')
  const [notes, setNotes] = useState(s?.notes || '')
  const [photos, setPhotos] = useState(s?.photo_urls || [])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveErr, setSaveErr] = useState('')

  async function reschedule() {
    if (!slot) return
    setRescheduling(true); setRescheduleMsg('')
    try {
      await api.post(`/services/bookings/${b.id}/schedule`, { start_at: slot })
      setSlot(null)
      await reload()
    } catch (e) {
      setRescheduleMsg(e?.response?.data?.detail || 'Failed to reschedule the survey.')
    } finally { setRescheduling(false) }
  }

  async function addPhotos(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setUploading(true); setUploadMsg('')
    const failed = []
    for (const f of files) {
      const fd = new FormData()
      fd.append('file', f)
      try {
        const res = await api.post('/public/services/upload', fd, { baseURL: '/api/v1', timeout: 120000 })
        setPhotos((p) => [...p, res.data.url])
      } catch (err) {
        failed.push(`${f.name}: ${err?.response?.data?.detail || 'upload failed'}`)
      }
    }
    if (failed.length) setUploadMsg(`Some photos were not added — ${failed.join('; ')}`)
    setUploading(false)
  }

  async function save() {
    const next = {}
    const ftN = Number(ft)
    const nestsN = Number(nests)
    if (ft === '' || !Number.isInteger(ftN) || ftN < 1) next.ft = 'Enter a whole number of feet (1 or more).'
    if (nests === '' || !Number.isInteger(nestsN) || nestsN < 0) next.nests = 'Enter a whole number (0 or more).'
    setErrors(next); setSaveErr('')
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await api.post(`/services/bookings/${b.id}/survey-result`, {
        perimeter_ft: ftN, nest_count: nestsN, notes: notes.trim() || null, photo_urls: photos,
      })
      await reload()
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Failed to save the survey result.')
    } finally { setSaving(false) }
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current step · 1 of 6</div>
      <h2 className="mt-1 text-lg font-bold">Drone survey</h2>
      {b.scheduled_at ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          <div className="text-sm">Survey time: <b>{fmtCalgary(b.scheduled_at)}</b> <span className="text-slate-500">(Calgary time)</span></div>
        </div>
      ) : null}

      {b.status === 'survey_scheduled' ? (
        <details className="mt-3 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Change survey time</summary>
          <div className="mt-3">
            <AdminSlotPicker value={slot} onChange={setSlot} />
          </div>
          <button type="button" disabled={!slot || rescheduling} onClick={reschedule}
            className="mt-3 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            {rescheduling ? 'Rescheduling…' : 'Reschedule survey & notify customer'}
          </button>
          {rescheduleMsg ? <p role="alert" className={errText}>{rescheduleMsg}</p> : null}
        </details>
      ) : null}

      <hr className="my-4 border-slate-200" />
      <h3 className="text-sm font-bold">Record survey result</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Perimeter to net (ft)</span>
          <input type="number" min="1" step="1" value={ft} onChange={(e) => setFt(e.target.value)} aria-invalid={errors.ft ? 'true' : undefined} className={field} />
          {errors.ft ? <span className={errText}>{errors.ft}</span> : null}</label>
        <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Active nests found</span>
          <input type="number" min="0" step="1" value={nests} onChange={(e) => setNests(e.target.value)} aria-invalid={errors.nests ? 'true' : undefined} className={field} />
          {errors.nests ? <span className={errText}>{errors.nests}</span> : null}</label>
      </div>
      <label className="mt-3 block text-sm"><span className="text-xs font-semibold text-slate-600">Survey notes</span>
        <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></label>
      <div className="mt-3">
        <span className="text-xs font-semibold text-slate-600">Drone photos</span>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {photos.map((u, i) => (
            <div key={u} className="relative h-20 overflow-hidden rounded-xl bg-slate-100">
              <img src={u} alt={`Drone photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((p) => p.filter((x) => x !== u))}
                className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          ))}
          <label className="flex h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-emerald-500 focus-within:border-emerald-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {uploading ? 'Uploading…' : 'Add'}
            <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={addPhotos} />
          </label>
        </div>
        <p aria-live="polite" className={uploadMsg ? errText : 'sr-only'}>{uploadMsg}</p>
        <p className="mt-1 text-xs text-slate-500">Photos are shown to the customer on the quote page.</p>
      </div>
      <button type="button" disabled={saving || uploading} onClick={save}
        className="mt-4 w-full cursor-pointer rounded-xl bg-emerald-700 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
        {saving ? 'Saving…' : 'Save survey result → Surveyed'}
      </button>
      {saveErr ? <p role="alert" className={`${errText} text-center`}>{saveErr}</p> : null}
      <p className="mt-1 text-center text-xs text-slate-500">No message is sent to the customer.</p>
    </section>
  )
}
