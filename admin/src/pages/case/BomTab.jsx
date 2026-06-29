import { useEffect, useState } from 'react'
import { api } from '../../services/api.js'
import { Card, SectionHeader } from '../../components/ui/Card.jsx'

function money(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

const EMPTY = { material_id: '', description: '', qty: '1', unit_cost: '', unit_price: '' }

export default function BomTab({ caseId, onChanged, onSuccess, onError }) {
  const [bom, setBom] = useState({ lines: [], total_cost: 0, total_sell: 0 })
  const [materials, setMaterials] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(EMPTY)

  async function load() {
    setError('')
    try {
      const [b, m] = await Promise.all([
        api.get(`/cases/${caseId}/bom`),
        api.get('/materials', { params: { active_only: true } }),
      ])
      setBom(b.data || { lines: [], total_cost: 0, total_sell: 0 })
      setMaterials(m.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load BOM') }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  function pickMaterial(id) {
    const m = materials.find((x) => String(x.id) === String(id))
    if (!m) { setDraft((d) => ({ ...d, material_id: '' })); return }
    setDraft((d) => ({
      ...d,
      material_id: id,
      description: m.name,
      unit_cost: String(m.default_unit_cost),
      unit_price: String(m.default_sell_price),
    }))
  }

  async function addLine() {
    if (!draft.description.trim()) return
    setBusy(true); setError('')
    try {
      await api.post(`/cases/${caseId}/bom`, {
        material_id: draft.material_id || null,
        description: draft.description.trim(),
        qty: Number(draft.qty || 0),
        unit_cost: Number(draft.unit_cost || 0),
        unit_price: Number(draft.unit_price || 0),
      })
      setDraft(EMPTY)
      await load(); onChanged?.()
      onSuccess?.('BOM line added.')
    } catch (e) { const m = e?.response?.data?.detail || 'Failed to add line'; setError(m); onError?.(m) }
    finally { setBusy(false) }
  }

  async function removeLine(id) {
    setBusy(true); setError('')
    try { await api.delete(`/bom/${id}`); await load(); onChanged?.(); onSuccess?.('BOM line removed.') }
    catch (e) { const m = e?.response?.data?.detail || 'Failed to delete line'; setError(m); onError?.(m) }
    finally { setBusy(false) }
  }

  async function generateQuote() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await api.post(`/cases/${caseId}/bom/generate-quote`, { install_type: 'surface_mount' })
      const msg = `Quote created from BOM (base ${money(res.data.base_price)}). Review it in the Quote tab.`
      setSuccess(msg); onSuccess?.(msg)
      onChanged?.()
    } catch (e) { const m = e?.response?.data?.detail || 'Failed to generate quote'; setError(m); onError?.(m) }
    finally { setBusy(false) }
  }

  const inputCls = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'

  return (
    <Card className="p-5">
      <SectionHeader
        eyebrow="Bill of materials"
        title="Internal cost vs customer price"
        action={
          <button type="button" disabled={busy || bom.lines.length === 0} onClick={generateQuote} className="cursor-pointer rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60">
            Generate quote from BOM
          </button>
        }
      />
      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{success}</div> : null}

      {/* Add line */}
      <div className="mt-4 grid gap-2 lg:grid-cols-6">
        <select value={draft.material_id} onChange={(e) => pickMaterial(e.target.value)} className={`${inputCls} bg-white lg:col-span-2`}>
          <option value="">Ad-hoc item…</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.category})</option>)}
        </select>
        <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" className={`${inputCls} lg:col-span-2`} />
        <input value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Qty" className={inputCls} />
        <div className="grid grid-cols-2 gap-2 lg:col-span-1">
          <input value={draft.unit_cost} onChange={(e) => setDraft((d) => ({ ...d, unit_cost: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Cost" className={inputCls} />
          <input value={draft.unit_price} onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Price" className={inputCls} />
        </div>
        <div className="lg:col-span-6">
          <button type="button" disabled={busy || !draft.description.trim()} onClick={addLine} className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">Add line</button>
        </div>
      </div>

      {/* Lines */}
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Unit cost</th>
              <th className="px-3 py-2.5">Unit price</th><th className="px-3 py-2.5">Line total</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bom.lines.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5 font-medium text-slate-900">{l.description}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-600">{l.qty}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-500">{money(l.unit_cost)}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-900">{money(l.unit_price)}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900">{money(l.line_total)}</td>
                <td className="px-3 py-2.5">
                  <button type="button" disabled={busy} onClick={() => removeLine(l.id)} className="cursor-pointer rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">Delete</button>
                </td>
              </tr>
            ))}
            {bom.lines.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No BOM lines yet.</td></tr>
            ) : null}
          </tbody>
          {bom.lines.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-slate-50 font-semibold text-slate-900">
                <td className="px-3 py-2.5" colSpan={2}>Totals</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-500">{money(bom.total_cost)}</td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5 tabular-nums">{money(bom.total_sell)}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  )
}
