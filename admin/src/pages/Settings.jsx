import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'

export default function Settings() {
  const [allSettings, setAllSettings] = useState([])
  const [pricingJson, setPricingJson] = useState('')
  const [etransferJson, setEtransferJson] = useState('')
  const [emailTemplatesJson, setEmailTemplatesJson] = useState('')
  const [smsTemplatesJson, setSmsTemplatesJson] = useState('')
  const [brands, setBrands] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandOrder, setNewBrandOrder] = useState('0')

  async function load() {
    setError('')
    try {
      const [s, b] = await Promise.all([api.get('/settings'), api.get('/charger-brands')])
      setAllSettings(s.data || [])
      const pricing = (s.data || []).find((x) => x.key === 'pricing_defaults')?.value || {}
      setPricingJson(JSON.stringify(pricing, null, 2))
      const et = (s.data || []).find((x) => x.key === 'etransfer_settings')?.value || {}
      setEtransferJson(JSON.stringify(et, null, 2))
      const emailTemplates = (s.data || []).find((x) => x.key === 'email_templates')?.value || {}
      setEmailTemplatesJson(JSON.stringify(emailTemplates, null, 2))
      const smsTemplates = (s.data || []).find((x) => x.key === 'sms_templates')?.value || {}
      setSmsTemplatesJson(JSON.stringify(smsTemplates, null, 2))
      setBrands(b.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load settings')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function savePricing() {
    setBusy(true)
    setError('')
    try {
      const parsed = JSON.parse(pricingJson || '{}')
      await api.put('/settings/pricing_defaults', { value: parsed })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to save pricing')
    } finally {
      setBusy(false)
    }
  }

  async function saveEtransfer() {
    setBusy(true)
    setError('')
    try {
      const parsed = JSON.parse(etransferJson || '{}')
      await api.put('/settings/etransfer_settings', { value: parsed })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to save e-transfer settings')
    } finally {
      setBusy(false)
    }
  }

  async function saveEmailTemplates() {
    setBusy(true)
    setError('')
    try {
      const parsed = JSON.parse(emailTemplatesJson || '{}')
      await api.put('/settings/email_templates', { value: parsed })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to save email templates')
    } finally {
      setBusy(false)
    }
  }

  async function saveSmsTemplates() {
    setBusy(true)
    setError('')
    try {
      const parsed = JSON.parse(smsTemplatesJson || '{}')
      await api.put('/settings/sms_templates', { value: parsed })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to save sms templates')
    } finally {
      setBusy(false)
    }
  }

  async function addBrand() {
    const name = newBrandName.trim()
    if (!name) return
    setBusy(true)
    setError('')
    try {
      await api.post('/charger-brands', { name, sort_order: Number(newBrandOrder || 0), is_active: true })
      setNewBrandName('')
      setNewBrandOrder('0')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to add brand')
    } finally {
      setBusy(false)
    }
  }

  async function deleteBrand(id) {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/charger-brands/${id}`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to delete brand')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <div className="mt-1 text-sm text-slate-600">Super Admin only.</div>
      </div>

      {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Pricing defaults</div>
          <div className="mt-2 text-xs text-slate-500">Edit JSON and save.</div>
          <textarea
            value={pricingJson}
            onChange={(e) => setPricingJson(e.target.value)}
            className="mt-3 h-72 w-full rounded-xl border bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-teal-600"
          />
          <button
            type="button"
            disabled={busy}
            onClick={savePricing}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            Save pricing_defaults
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">E-transfer settings</div>
          <div className="mt-2 text-xs text-slate-500">
            Stored in <span className="font-mono">system_settings.etransfer_settings</span>.
          </div>
          <textarea
            value={etransferJson}
            onChange={(e) => setEtransferJson(e.target.value)}
            className="mt-3 h-72 w-full rounded-xl border bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-teal-600"
          />
          <button
            type="button"
            disabled={busy}
            onClick={saveEtransfer}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            Save etransfer_settings
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Email templates</div>
          <div className="mt-2 text-xs text-slate-500">
            Stored in <span className="font-mono">system_settings.email_templates</span>. Jinja supported.
          </div>
          <textarea
            value={emailTemplatesJson}
            onChange={(e) => setEmailTemplatesJson(e.target.value)}
            className="mt-3 h-72 w-full rounded-xl border bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-teal-600"
          />
          <button
            type="button"
            disabled={busy}
            onClick={saveEmailTemplates}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            Save email_templates
          </button>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Charger brands</div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 md:col-span-2"
              placeholder="New brand name"
            />
            <input
              value={newBrandOrder}
              onChange={(e) => setNewBrandOrder(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              placeholder="sort"
            />
            <button
              type="button"
              disabled={busy}
              onClick={addBrand}
              className="md:col-span-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Add brand
            </button>
          </div>

          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{b.name}</td>
                    <td className="px-3 py-2">{b.sort_order}</td>
                    <td className="px-3 py-2">{b.is_active ? 'yes' : 'no'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deleteBrand(b.id)}
                        className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {brands.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                      No brands.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">SMS templates</div>
        <div className="mt-2 text-xs text-slate-500">
          Stored in <span className="font-mono">system_settings.sms_templates</span>. Jinja supported.
        </div>
        <textarea
          value={smsTemplatesJson}
          onChange={(e) => setSmsTemplatesJson(e.target.value)}
          className="mt-3 h-72 w-full rounded-xl border bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          type="button"
          disabled={busy}
          onClick={saveSmsTemplates}
          className="mt-3 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          Save sms_templates
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">All settings (read-only)</div>
        <pre className="mt-2 overflow-auto rounded-xl border bg-slate-50 p-3 text-xs">
          {JSON.stringify(allSettings, null, 2)}
        </pre>
      </div>
    </AdminShell>
  )
}

