import { useEffect, useState } from 'react'
import { api } from '../../services/api.js'
import { Card, SectionHeader } from '../../components/ui/Card.jsx'
import { Pill } from '../../components/ui/Pill.jsx'

const CATEGORY_LABELS = {
  survey_photo: 'Survey photos',
  permit_doc: 'Permit documents',
  installation_photo: 'Installation photos',
  signed_quote: 'Signed quotes',
  contract: 'Contracts',
  invoice: 'Invoices',
  other: 'Other',
}
const UPLOAD_CATEGORIES = ['permit_doc', 'signed_quote', 'contract', 'invoice', 'other']

function isImage(name) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ''))
}
function isPdf(name) {
  return /\.pdf$/i.test(String(name || ''))
}

export default function AttachmentsTab({ caseId, onPreview }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('contract')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/cases/${caseId}/attachments`)
      setItems(res.data || [])
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load attachments') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  async function upload() {
    if (!file) return
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const qp = new URLSearchParams({ category })
      if (caption.trim()) qp.set('caption', caption.trim())
      await api.post(`/cases/${caseId}/attachments?${qp.toString()}`, form)
      setFile(null); setCaption('')
      await load()
    } catch (e) { setError(e?.response?.data?.detail || 'Upload failed') }
    finally { setBusy(false) }
  }

  async function remove(id) {
    setBusy(true); setError('')
    try { await api.delete(`/attachments/${id}`); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Delete failed') }
    finally { setBusy(false) }
  }

  const groups = items.reduce((acc, it) => {
    (acc[it.category] = acc[it.category] || []).push(it)
    return acc
  }, {})
  const orderedKeys = Object.keys(CATEGORY_LABELS).filter((k) => groups[k]?.length)

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionHeader eyebrow="Attachment center" title="All case files in one place" />
        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {UPLOAD_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        </div>
        <button type="button" disabled={busy || !file} onClick={upload} className="mt-3 cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60">
          {busy ? 'Uploading…' : 'Upload file'}
        </button>
      </Card>

      {loading ? (
        <Card className="p-5"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>
      ) : items.length === 0 ? (
        <Card className="p-8"><p className="text-center text-sm text-slate-400">No attachments yet.</p></Card>
      ) : (
        orderedKeys.map((key) => (
          <Card key={key} className="p-5">
            <SectionHeader eyebrow={CATEGORY_LABELS[key]} title={`${groups[key].length} file(s)`} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups[key].map((a) => {
                const previewable = isImage(a.original_name) || isImage(a.file_path)
                return (
                <div key={`${a.source}-${a.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {previewable ? (
                    <button
                      type="button"
                      onClick={() => onPreview?.({ src: `/${a.file_path}`, title: a.original_name, subtitle: a.caption || CATEGORY_LABELS[key] })}
                      className="block w-full cursor-pointer bg-slate-50"
                      title="Preview"
                    >
                      <img src={`/${a.file_path}`} alt={a.original_name} className="h-36 w-full object-cover" />
                    </button>
                  ) : (
                    // Non-images (PDF/doc) can't render in the image modal — open the file directly.
                    <a href={`/${a.file_path}`} target="_blank" rel="noreferrer" className="block w-full cursor-pointer bg-slate-50" title="Open file">
                      <div className="flex h-36 w-full items-center justify-center text-slate-400">
                        <span className="text-xs font-semibold uppercase">{isPdf(a.original_name) ? 'PDF' : 'FILE'}</span>
                      </div>
                    </a>
                  )}
                  <div className="p-3">
                    <div className="truncate text-sm font-medium text-slate-900" title={a.original_name}>{a.original_name}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString()}</span>
                      {a.deletable ? (
                        <button type="button" disabled={busy} onClick={() => remove(a.id)} className="cursor-pointer rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60">Delete</button>
                      ) : (
                        <Pill tone="slate">{a.source.replace('_', ' ')}</Pill>
                      )}
                    </div>
                    {a.caption ? <div className="mt-1 truncate text-xs text-slate-500">{a.caption}</div> : null}
                  </div>
                </div>
                )
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
