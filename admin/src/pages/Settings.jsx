import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import MaterialsManager from '../components/MaterialsManager.jsx'

export default function Settings() {
  const [allSettings, setAllSettings] = useState([])
  const [pricingJson, setPricingJson] = useState('')
  const [etransferJson, setEtransferJson] = useState('')
  const [emailTemplatesJson, setEmailTemplatesJson] = useState('')
  const [smsTemplatesJson, setSmsTemplatesJson] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [warrantyYears, setWarrantyYears] = useState('1')
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

      const bp = (s.data || []).find((x) => x.key === 'brand_profile')?.value || {}
      setSupportEmail(bp?.support_email || '')
      setSupportPhone(bp?.support_phone || '')
      setLogoUrl(bp?.logo_url || '')
      setWarrantyYears(String(bp?.warranty_years || 1))

      setBrands(b.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load settings') }
  }

  useEffect(() => { load() }, [])

  async function savePricing() {
    setBusy(true); setError('')
    try { const parsed = JSON.parse(pricingJson || '{}'); await api.put('/settings/pricing_defaults', { value: parsed }); await load() }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to save pricing') }
    finally { setBusy(false) }
  }

  async function saveEtransfer() {
    setBusy(true); setError('')
    try { const parsed = JSON.parse(etransferJson || '{}'); await api.put('/settings/etransfer_settings', { value: parsed }); await load() }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to save e-transfer settings') }
    finally { setBusy(false) }
  }

  async function saveEmailTemplates() {
    setBusy(true); setError('')
    try { const parsed = JSON.parse(emailTemplatesJson || '{}'); await api.put('/settings/email_templates', { value: parsed }); await load() }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to save email templates') }
    finally { setBusy(false) }
  }

  async function saveSmsTemplates() {
    setBusy(true); setError('')
    try { const parsed = JSON.parse(smsTemplatesJson || '{}'); await api.put('/settings/sms_templates', { value: parsed }); await load() }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to save sms templates') }
    finally { setBusy(false) }
  }

  async function saveBrandProfile() {
    setBusy(true); setError('')
    try {
      const payload = { support_email: (supportEmail || '').trim(), support_phone: (supportPhone || '').trim(), logo_url: (logoUrl || '').trim(), warranty_years: Math.max(1, Number(warrantyYears || 1)) }
      await api.put('/settings/brand_profile', { value: payload }); await load()
    } catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to save brand_profile') }
    finally { setBusy(false) }
  }

  async function uploadLogo(file) {
    if (!file) return
    setBusy(true); setError('')
    try { const fd = new FormData(); fd.append('file', file); const res = await api.post('/settings/brand-logo', fd); const nextUrl = res?.data?.logo_url || ''; if (nextUrl) setLogoUrl(nextUrl); await load() }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Failed to upload logo') }
    finally { setBusy(false) }
  }

  async function addBrand() {
    const name = newBrandName.trim(); if (!name) return
    setBusy(true); setError('')
    try { await api.post('/charger-brands', { name, sort_order: Number(newBrandOrder || 0), is_active: true }); setNewBrandName(''); setNewBrandOrder('0'); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to add brand') }
    finally { setBusy(false) }
  }

  async function deleteBrand(id) {
    setBusy(true); setError('')
    try { await api.delete(`/charger-brands/${id}`); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to delete brand') }
    finally { setBusy(false) }
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
  const textareaClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-mono text-xs outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Super Admin only.</p>
        </div>

        {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Brand Profile */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Brand profile</h2>
            <p className="mt-1 text-xs text-slate-500">Used in email templates. Stored in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">system_settings.brand_profile</code>.</p>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="text-xs font-semibold text-slate-700">Support email</span><input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className={inputClass} placeholder="info@khtain.com" /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Support phone</span><input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className={inputClass} placeholder="+1xxxxxxxxxx" /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Warranty (years)</span><input value={warrantyYears} onChange={(e) => setWarrantyYears(e.target.value)} className={inputClass} placeholder="1" /></label>
              <div className="rounded-xl border bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-700">Logo</span>
                <div className="mt-1 text-xs text-slate-600">
                  {logoUrl ? <>Current: <a className="break-all text-sky-600 underline" href={logoUrl} target="_blank" rel="noreferrer">{logoUrl}</a></> : <>No logo URL set.</>}
                </div>
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadLogo(f) }} className="mt-2 block w-full text-xs" />
                <div className="mt-1 text-[11px] text-slate-400">PNG/JPG/WEBP, max 5MB.</div>
              </div>
            </div>
            <button type="button" disabled={busy} onClick={saveBrandProfile} className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
              Save brand_profile
            </button>
          </div>

          {/* Pricing */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Pricing defaults</h2>
            <p className="mt-1 text-xs text-slate-500">Edit JSON and save.</p>
            <textarea value={pricingJson} onChange={(e) => setPricingJson(e.target.value)} className={`${textareaClass} h-72`} spellCheck={false} />
            <button type="button" disabled={busy} onClick={savePricing} className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
              Save pricing_defaults
            </button>
          </div>

          {/* E-Transfer */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">E-transfer settings</h2>
            <p className="mt-1 text-xs text-slate-500">Stored in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">system_settings.etransfer_settings</code>.</p>
            <textarea value={etransferJson} onChange={(e) => setEtransferJson(e.target.value)} className={`${textareaClass} h-72`} spellCheck={false} />
            <button type="button" disabled={busy} onClick={saveEtransfer} className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
              Save etransfer_settings
            </button>
          </div>

          {/* Email Templates */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Email templates</h2>
            <p className="mt-1 text-xs text-slate-500">Stored in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">system_settings.email_templates</code>. Jinja supported.</p>
            <textarea value={emailTemplatesJson} onChange={(e) => setEmailTemplatesJson(e.target.value)} className={`${textareaClass} h-72`} spellCheck={false} />
            <button type="button" disabled={busy} onClick={saveEmailTemplates} className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
              Save email_templates
            </button>
          </div>

          {/* Charger Brands */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Charger brands</h2>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              <input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} className={`${inputClass} mt-0 md:col-span-2`} placeholder="New brand name" />
              <input value={newBrandOrder} onChange={(e) => setNewBrandOrder(e.target.value)} className={`${inputClass} mt-0`} placeholder="sort" />
              <button type="button" disabled={busy} onClick={addBrand} className="md:col-span-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
                Add brand
              </button>
            </div>
            <div className="mt-4 overflow-auto rounded-xl border">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Name</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Active</th><th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brands.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{b.name}</td>
                      <td className="px-4 py-3 text-slate-600">{b.sort_order}</td>
                      <td className="px-4 py-3">{b.is_active ? <span className="text-emerald-600 font-medium">yes</span> : <span className="text-slate-400">no</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" disabled={busy} onClick={() => deleteBrand(b.id)} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-60">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {brands.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">No brands.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SMS Templates */}
        <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">SMS templates</h2>
          <p className="mt-1 text-xs text-slate-500">Stored in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">system_settings.sms_templates</code>. Jinja supported.</p>
          <textarea value={smsTemplatesJson} onChange={(e) => setSmsTemplatesJson(e.target.value)} className={`${textareaClass} mt-3 h-72`} spellCheck={false} />
          <button type="button" disabled={busy} onClick={saveSmsTemplates} className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60">
            Save sms_templates
          </button>
        </div>

        {/* Material catalog */}
        <MaterialsManager />

        {/* Raw settings */}
        <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">All settings (read-only)</h2>
          <pre className="mt-3 overflow-auto rounded-xl border bg-slate-50 p-4 text-xs text-slate-600">{JSON.stringify(allSettings, null, 2)}</pre>
        </div>
      </div>
    </AdminShell>
  )
}
