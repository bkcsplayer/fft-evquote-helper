import { useState } from 'react'
import { api } from '../services/api.js'
import { useI18n } from '../i18n/index.js'

/** Optional multi-photo upload for service intake forms (POST /public/services/upload). */
export function PhotoUpload({ urls, onChange }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setErr('')
    try {
      const uploaded = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await api.post('/public/services/upload', fd)
        uploaded.push(res.data.url)
      }
      onChange?.([...(urls || []), ...uploaded])
    } catch {
      setErr(t('svc.common.err_upload'))
    } finally {
      setBusy(false)
    }
  }

  function remove(url) {
    onChange?.((urls || []).filter((u) => u !== url))
  }

  return (
    <div>
      {(urls || []).length ? (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {urls.map((u) => (
            <div key={u} className="relative overflow-hidden rounded-xl border bg-slate-50">
              <img src={u} alt="" className="h-20 w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(u)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >
                {t('svc.common.remove')}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        {busy ? t('svc.common.uploading') : t('svc.common.upload')}
        <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} disabled={busy} />
      </label>
      {err ? <div className="mt-1 text-xs text-rose-700">{err}</div> : null}
    </div>
  )
}
