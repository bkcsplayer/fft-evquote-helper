import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { Pill } from './ui/Pill.jsx'

const CATEGORIES = ['charger', 'cable', 'breaker', 'conduit', 'labor', 'misc']
const CAT_TONE = { charger: 'teal', cable: 'indigo', breaker: 'amber', conduit: 'slate', labor: 'emerald', misc: 'slate' }

function money(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

const EMPTY = { sku: '', name: '', category: 'misc', unit: 'each', default_unit_cost: '', default_sell_price: '' }

export default function MaterialsManager() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(EMPTY)

  async function load() {
    setError('')
    try { const res = await api.get('/materials'); setItems(res.data || []) }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to load materials') }
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!draft.sku.trim() || !draft.name.trim()) return
    setBusy(true); setError('')
    try {
      await api.post('/materials', {
        sku: draft.sku.trim(), name: draft.name.trim(), category: draft.category, unit: draft.unit.trim() || 'each',
        default_unit_cost: Number(draft.default_unit_cost || 0), default_sell_price: Number(draft.default_sell_price || 0),
      })
      setDraft(EMPTY); await load()
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to add material') }
    finally { setBusy(false) }
  }

  async function remove(id) {
    setBusy(true); setError('')
    try { await api.delete(`/materials/${id}`); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to delete material') }
    finally { setBusy(false) }
  }

  const inputCls = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'

  return (
    <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">Material catalog</h2>
      <p className="mt-1 text-xs text-slate-500">Reusable materials with default cost &amp; sell price — used to build case BOMs.</p>
      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-4 grid gap-2 lg:grid-cols-7">
        <input value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="SKU" className={inputCls} />
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" className={`${inputCls} lg:col-span-2`} />
        <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className={`${inputCls} bg-white`}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={draft.default_unit_cost} onChange={(e) => setDraft((d) => ({ ...d, default_unit_cost: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Cost" className={inputCls} />
        <input value={draft.default_sell_price} onChange={(e) => setDraft((d) => ({ ...d, default_sell_price: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Sell" className={inputCls} />
        <button type="button" disabled={busy || !draft.sku.trim() || !draft.name.trim()} onClick={add} className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">Add</button>
      </div>

      <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">SKU</th><th className="px-3 py-2.5">Name</th><th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Cost</th><th className="px-3 py-2.5">Sell</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((m) => (
              <tr key={m.id} className={`hover:bg-slate-50 ${m.active ? '' : 'opacity-50'}`}>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{m.sku}</td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{m.name}</td>
                <td className="px-3 py-2.5"><Pill tone={CAT_TONE[m.category] || 'slate'}>{m.category}</Pill></td>
                <td className="px-3 py-2.5 tabular-nums text-slate-500">{money(m.default_unit_cost)}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-900">{money(m.default_sell_price)}</td>
                <td className="px-3 py-2.5">
                  <button type="button" disabled={busy} onClick={() => remove(m.id)} className="cursor-pointer rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No materials yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
