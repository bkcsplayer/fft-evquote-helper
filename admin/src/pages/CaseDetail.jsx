import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
import { StatusTag } from '../components/ui/StatusTag.jsx'
import { StageFlow } from '../components/ui/StageFlow.jsx'
import { CaseFlowHeader } from '../components/ui/CaseFlowHeader.jsx'
import { CASE_STATUS_ORDER, statusLabel } from '../utils/caseStatus.js'
import AttachmentsTab from './case/AttachmentsTab.jsx'
import FinanceTab from './case/FinanceTab.jsx'
import BomTab from './case/BomTab.jsx'
import {
  canCreateOrEditQuote,
  canEditInstallation,
  canEditPermit,
  canMarkInstalled,
  canUploadSurveyPhotos,
  isAtOrAfter,
} from '../utils/caseStatus.js'

/* ── Shared tone colors ── */
const SECTION_TONES = {
  slate: { border: 'border-slate-200', headerBg: 'bg-slate-50', headerText: 'text-slate-700', accent: 'border-l-slate-400' },
  teal: { border: 'border-teal-200', headerBg: 'bg-teal-50/70', headerText: 'text-teal-800', accent: 'border-l-teal-500' },
  amber: { border: 'border-amber-200', headerBg: 'bg-amber-50/70', headerText: 'text-amber-800', accent: 'border-l-amber-500' },
  emerald: { border: 'border-emerald-200', headerBg: 'bg-emerald-50/70', headerText: 'text-emerald-800', accent: 'border-l-emerald-500' },
  indigo: { border: 'border-indigo-200', headerBg: 'bg-indigo-50/70', headerText: 'text-indigo-800', accent: 'border-l-indigo-500' },
  rose: { border: 'border-rose-200', headerBg: 'bg-rose-50/70', headerText: 'text-rose-800', accent: 'border-l-rose-500' },
}

function SectionCard({ tone = 'slate', title, subtitle, right, className = '', children }) {
  const s = SECTION_TONES[tone] || SECTION_TONES.slate
  return (
    <div className={`${className} overflow-hidden rounded-2xl border ${s.border} bg-white shadow-sm`}>
      <div className={`flex items-start justify-between gap-3 border-b ${s.border} ${s.headerBg} px-5 py-3.5`}>
        <div className="min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wider ${s.headerText}`}>{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function LockedSection({ locked, reason, children }) {
  if (!locked) return children
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/50 backdrop-blur-[2px]">
        <div className="max-w-md rounded-xl border bg-white px-5 py-4 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-800">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Locked
          </div>
          <div className="mt-2 text-sm text-slate-600">{reason}</div>
        </div>
      </div>
    </div>
  )
}

function money(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

function isPreviewableImageFileName(name) {
  const s = String(name || '').toLowerCase()
  return s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.webp') || s.endsWith('.gif')
}

const inputCls = "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 disabled:text-slate-500"
const textareaCls = "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 disabled:text-slate-500"
const selectCls = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 disabled:text-slate-500"
const btnPrimary = "inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-60"
const btnCTA = "inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-800 active:scale-95 disabled:opacity-60"
const btnOutline = "inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-60"

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'survey', label: 'Survey' },
  { id: 'quote', label: 'Quote' },
  { id: 'permit', label: 'Permit' },
  { id: 'install', label: 'Install' },
  { id: 'files', label: 'Files' },
  { id: 'bom', label: 'BOM' },
  { id: 'finance', label: 'Finance' },
  { id: 'signature', label: 'Signature' },
  { id: 'activity', label: 'Activity' },
]
const HASH_TO_TAB = { permit: 'permit', installation: 'install', quote: 'quote' }

export default function CaseDetail() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const [preview, setPreview] = useState(null)

  const [surveyDt, setSurveyDt] = useState('')
  const [surveyRejectNote, setSurveyRejectNote] = useState('')
  const [surveyNotes, setSurveyNotes] = useState('')
  const [surveyPhotoCategory, setSurveyPhotoCategory] = useState('panel_front')
  const [surveyPhotoCaption, setSurveyPhotoCaption] = useState('')
  const [surveyPhotoFile, setSurveyPhotoFile] = useState(null)
  const [surveyPhotos, setSurveyPhotos] = useState([])

  const [installType, setInstallType] = useState('surface_mount')
  const [basePrice, setBasePrice] = useState('699.00')
  const [extraMeters, setExtraMeters] = useState('0')
  const [extraRate, setExtraRate] = useState('30.00')
  const [permitFee, setPermitFee] = useState('349.00')
  const [surveyCredit, setSurveyCredit] = useState('0')
  const [addonName, setAddonName] = useState('')
  const [addonPrice, setAddonPrice] = useState('')

  const [permit, setPermit] = useState(null)
  const [permitNumber, setPermitNumber] = useState('')
  const [permitStatus, setPermitStatus] = useState('applied')
  const [permitAppliedDate, setPermitAppliedDate] = useState('')
  const [permitExpectedDate, setPermitExpectedDate] = useState('')
  const [permitActualDate, setPermitActualDate] = useState('')
  const [permitNotes, setPermitNotes] = useState('')
  const [permitFile, setPermitFile] = useState(null)

  const [installation, setInstallation] = useState(null)
  const [installDt, setInstallDt] = useState('')
  const [installNotes, setInstallNotes] = useState('')
  const [installRejectNote, setInstallRejectNote] = useState('')
  const [installReportInstalledItems, setInstallReportInstalledItems] = useState('')
  const [installReportWireGauge, setInstallReportWireGauge] = useState('')
  const [installReportMaxAmps, setInstallReportMaxAmps] = useState('')
  const [installReportTestPassed, setInstallReportTestPassed] = useState(false)
  const [installReportTestNotes, setInstallReportTestNotes] = useState('')
  const [installPhotoCaption, setInstallPhotoCaption] = useState('')
  const [installPhotoFile, setInstallPhotoFile] = useState(null)
  const [installPhotos, setInstallPhotos] = useState([])

  const [timeline, setTimeline] = useState([])
  const [notifications, setNotifications] = useState([])
  const [resendEmailTo, setResendEmailTo] = useState('')
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')

  const [overridePassword, setOverridePassword] = useState('')
  const [overrideToStatus, setOverrideToStatus] = useState('')
  const [overrideNote, setOverrideNote] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [res, p, inst, photos, instPhotos, tl, ns, notesRes] = await Promise.all([
        api.get(`/cases/${id}`), api.get(`/cases/${id}/permit`), api.get(`/cases/${id}/installation`),
        api.get(`/cases/${id}/survey/photos`), api.get(`/cases/${id}/installation/photos`),
        api.get(`/cases/${id}/timeline`), api.get(`/cases/${id}/notifications`), api.get(`/cases/${id}/notes`),
      ])
      setData(res.data); setPermit(p.data || null); setInstallation(inst.data || null)
      setSurveyPhotos(photos.data || []); setInstallPhotos(instPhotos.data || [])
      setTimeline(tl.data || []); setNotifications(ns.data || []); setNotes(notesRes.data || [])

      try {
        const src = res.data?.survey_requested_date || res.data?.survey_scheduled_date
        if (src) { const d = new Date(src); const pad = (n) => String(n).padStart(2, '0'); setSurveyDt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`) }
        else setSurveyDt('')
      } catch { setSurveyDt('') }

      if (p.data) {
        setPermitNumber(p.data.permit_number || ''); setPermitStatus(p.data.status || 'applied')
        setPermitAppliedDate(p.data.applied_date || ''); setPermitExpectedDate(p.data.expected_approval_date || '')
        setPermitActualDate(p.data.actual_approval_date || ''); setPermitNotes(p.data.notes || '')
      } else {
        setPermitNumber(''); setPermitStatus('applied'); setPermitAppliedDate(''); setPermitExpectedDate('')
        setPermitActualDate(''); setPermitNotes('')
      }

      if (inst.data) {
        try {
          const src = inst.data.request_status === 'pending' && inst.data.requested_date ? inst.data.requested_date : inst.data.scheduled_date
          if (src) { const d = new Date(src); const pad = (n) => String(n).padStart(2, '0'); setInstallDt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`) }
          else setInstallDt('')
        } catch { setInstallDt('') }
        setInstallNotes(inst.data.notes || '')
        setInstallReportInstalledItems(inst.data.installed_items || ''); setInstallReportWireGauge(inst.data.wire_gauge || '')
        setInstallReportMaxAmps(inst.data.max_charging_amps == null ? '' : String(inst.data.max_charging_amps))
        setInstallReportTestPassed(!!inst.data.test_passed); setInstallReportTestNotes(inst.data.test_notes || '')
      } else {
        setInstallDt(''); setInstallNotes(''); setInstallReportInstalledItems(''); setInstallReportWireGauge('')
        setInstallReportMaxAmps(''); setInstallReportTestPassed(false); setInstallReportTestNotes('')
      }
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to load case') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => { if (data?.status) setOverrideToStatus(String(data.status)) }, [data?.status])
  useEffect(() => { if (!preview) return; const onKey = (e) => { if (e.key === 'Escape') setPreview(null) }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [preview])
  useEffect(() => { if (!success) return; const t = setTimeout(() => setSuccess(''), 4500); return () => clearTimeout(t) }, [success])
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(''), 7000); return () => clearTimeout(t) }, [error])
  useEffect(() => {
    // Deep links from other pages (e.g. /admin/cases/{id}#permit) open the matching tab.
    const hash = (loc.hash || '').replace('#', '').trim().toLowerCase()
    if (hash && HASH_TO_TAB[hash]) setTab(HASH_TO_TAB[hash])
  }, [loc.hash])

  const tokenLink = useMemo(() => {
    const token = data?.access_token; if (!token) return null
    try {
      const u = new URL(window.location.origin)
      const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.toLowerCase().endsWith('.local')
      if (isLocal) { if (u.port === '7221') u.port = '7220'; if (u.port === '7231') u.port = '7230' }
      return `${u.toString().replace(/\/$/, '')}/quote/status/${token}`
    } catch { return `http://localhost:7220/quote/status/${token}` }
  }, [data])

  const installationScheduledInFuture = useMemo(() => {
    try { const sd = installation?.scheduled_date; if (!sd) return false; return new Date(sd).getTime() > Date.now() }
    catch { return false }
  }, [installation?.scheduled_date])

  const hasPendingInstallRequest = useMemo(() => {
    const rs = String(installation?.request_status || '').trim(); return rs === 'pending' && !!installation?.requested_date
  }, [installation?.request_status, installation?.requested_date])

  const installationDateIssue = useMemo(() => {
    try { if (!installation?.completed_at || !installation?.scheduled_date) return false; return new Date(installation.completed_at).getTime() < new Date(installation.scheduled_date).getTime() }
    catch { return false }
  }, [installation?.completed_at, installation?.scheduled_date])

  const depositReportedAt = useMemo(() => {
    const rows = timeline || []
    for (let i = rows.length - 1; i >= 0; i -= 1) { if (rows[i]?.note === 'Customer reported e-transfer sent') return rows[i]?.created_at || null }
    return null
  }, [timeline])

  function toneForTimelineRow(row) {
    const note = String(row?.note || ''); const to = String(row?.to_status || '')
    if (note.includes('Deposit marked paid')) return 'emerald'
    if (note.includes('Customer reported e-transfer')) return 'amber'
    if (note.includes('Completion email sent')) return 'emerald'
    if (note.includes('Installation completed')) return 'emerald'
    if (note.includes('Permit approved')) return 'emerald'
    if (note.toLowerCase().includes('revision')) return 'amber'
    if (to === 'cancelled' || to === 'lost') return 'rose'
    if (to === 'customer_approved') return 'emerald'
    if (to === 'quoted') return 'teal'
    if (to === 'installation_scheduled') return 'teal'
    return 'slate'
  }

  // Action handlers (unchanged business logic, just UI refresh)
  async function scheduleSurvey() {
    if (!surveyDt) return; setBusy(true)
    try { await api.post(`/cases/${id}/survey/schedule`, { scheduled_date: new Date(surveyDt).toISOString() }); await load(); setSuccess('Survey scheduled.') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to schedule survey') }
    finally { setBusy(false) }
  }
  async function rejectSurveyRequest() {
    setBusy(true); setError(''); setSuccess('')
    try { await api.post(`/cases/${id}/survey/request/reject`, { note: surveyRejectNote.trim() || null }); setSurveyRejectNote(''); await load(); setSuccess('Survey request rejected — customer will choose again.') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to reject survey request') }
    finally { setBusy(false) }
  }
  async function completeSurvey() {
    setBusy(true); setError('')
    try { await api.patch(`/cases/${id}/survey/complete`, { survey_notes: surveyNotes.trim() || null }); setSurveyNotes(''); await load(); setSuccess('Survey completed.'); setTab('quote') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to complete survey') }
    finally { setBusy(false) }
  }
  async function markDepositPaid() {
    setBusy(true); setError('')
    try { await api.patch(`/cases/${id}/survey/deposit-paid`, { note: 'Deposit marked paid (e-transfer)' }); await load(); setSuccess('Deposit marked paid.') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to mark deposit paid') }
    finally { setBusy(false) }
  }
  async function uploadSurveyPhoto() {
    const files = surveyPhotoFile ? Array.from(surveyPhotoFile) : []
    if (!files.length) return
    setBusy(true); setError('')
    try {
      for (const f of files) {
        const form = new FormData(); form.append('file', f)
        const qp = new URLSearchParams(); qp.set('category', surveyPhotoCategory)
        if (surveyPhotoCaption.trim()) qp.set('caption', surveyPhotoCaption.trim())
        await api.post(`/cases/${id}/survey/photos?${qp.toString()}`, form)
      }
      setSurveyPhotoFile(null); setSurveyPhotoCaption(''); await load(); setSuccess('Survey photo uploaded.')
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to upload survey photo') }
    finally { setBusy(false) }
  }
  async function deleteSurveyPhoto(photoId) { setBusy(true); setError(''); try { await api.delete(`/survey/photos/${photoId}`); await load() } catch (e) { setError(e?.response?.data?.detail || 'Failed to delete photo') } finally { setBusy(false) } }
  async function createQuote() {
    setBusy(true); setError('')
    try { const addons = []; if (addonName.trim() && addonPrice) addons.push({ name: addonName.trim(), price: addonPrice }); const res = await api.post(`/cases/${id}/quotes`, { install_type: installType, base_price: basePrice, extra_distance_meters: extraMeters, extra_distance_rate: extraRate, permit_fee: permitFee, survey_credit: surveyCredit, addons }); setData((prev) => ({ ...prev, active_quote: res.data })); setAddonName(''); setAddonPrice(''); await load(); setSuccess('Quote created.') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to create quote') }
    finally { setBusy(false) }
  }
  async function sendQuote() { const quoteId = data?.active_quote?.id; if (!quoteId) return; setBusy(true); setError(''); try { await api.post(`/quotes/${quoteId}/send`); await load(); setSuccess('Quote sent to customer.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to send quote') } finally { setBusy(false) } }
  async function previewQuote() {
    const quoteId = data?.active_quote?.id; if (!quoteId) return; setBusy(true); setError('')
    try { const res = await api.get(`/quotes/${quoteId}/preview`); const w = window.open('', '_blank'); if (w) w.document.write(res.data?.html || '<p>No preview</p>') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to preview quote') }
    finally { setBusy(false) }
  }
  async function savePermit() {
    setBusy(true); setError('')
    try { const payload = { permit_number: permitNumber || null, applied_date: permitAppliedDate || null, expected_approval_date: permitExpectedDate || null, actual_approval_date: permitActualDate || null, status: permitStatus, notes: permitNotes || null }; const res = await api.post(`/cases/${id}/permit`, payload); setPermit(res.data); await load(); setSuccess('Permit saved.') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to save permit') }
    finally { setBusy(false) }
  }
  async function uploadPermitAttachment() { if (!permit?.id || !permitFile) return; setBusy(true); setError(''); try { const form = new FormData(); form.append('file', permitFile); await api.post(`/permits/${permit.id}/attachments`, form); setPermitFile(null); await load(); setSuccess('Attachment uploaded.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to upload attachment') } finally { setBusy(false) } }
  async function scheduleInstallation() { if (!installDt) return; setBusy(true); setError(''); try { await api.post(`/cases/${id}/installation/schedule`, { scheduled_date: new Date(installDt).toISOString(), notes: installNotes || null }); setInstallNotes(''); await load(); setSuccess('Installation scheduled.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to schedule installation') } finally { setBusy(false) } }
  async function rejectInstallationRequest() { setBusy(true); setError(''); setSuccess(''); try { await api.post(`/cases/${id}/installation/request/reject`, { note: installRejectNote.trim() || null }); setInstallRejectNote(''); await load(); setSuccess('Installation request rejected — customer will choose again.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to reject installation request') } finally { setBusy(false) } }
  async function completeInstallation() { setBusy(true); setError(''); try { await api.patch(`/cases/${id}/installation/complete`, { notes: installNotes || null }); setInstallNotes(''); await load(); setSuccess('Installation marked complete.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to complete installation') } finally { setBusy(false) } }
  async function saveInstallationReport() { setBusy(true); setError(''); try { const payload = { installed_items: installReportInstalledItems || null, wire_gauge: installReportWireGauge || null, max_charging_amps: installReportMaxAmps === '' ? null : Number(installReportMaxAmps), test_passed: !!installReportTestPassed, test_notes: installReportTestNotes || null }; await api.patch(`/cases/${id}/installation/report`, payload); await load(); setSuccess('Installation report saved.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to save installation report') } finally { setBusy(false) } }
  async function uploadInstallationPhoto() {
    const files = installPhotoFile ? Array.from(installPhotoFile) : []
    if (!files.length) return
    setBusy(true); setError('')
    try {
      for (const f of files) {
        const form = new FormData()
        form.append('file', f)
        if (installPhotoCaption) form.append('caption', installPhotoCaption)
        await api.post(`/cases/${id}/installation/photos`, form)
      }
      setInstallPhotoCaption(''); setInstallPhotoFile(null); await load(); setSuccess('Installation photo uploaded.')
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to upload installation photo') }
    finally { setBusy(false) }
  }
  async function deleteInstallationPhoto(photoId) { setBusy(true); setError(''); try { await api.delete(`/installation/photos/${photoId}`); await load() } catch (e) { setError(e?.response?.data?.detail || 'Failed to delete photo') } finally { setBusy(false) } }
  async function sendInstallationReport() { setBusy(true); setError(''); setSuccess(''); try { await api.post(`/cases/${id}/installation/report/send`); await load(); setSuccess('Install report sent.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to send installation report') } finally { setBusy(false) } }
  async function sendCompletionEmail() { setBusy(true); setError(''); setSuccess(''); try { await api.post(`/cases/${id}/completion-email`); await load(); setSuccess('Completion email sent. Case marked completed.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to send completion email') } finally { setBusy(false) } }
  async function resendEmail(notificationId) { if (!notificationId) return; setBusy(true); setError(''); try { await api.post(`/notifications/${notificationId}/resend`, { to_email: resendEmailTo.trim() || null }); await load(); setSuccess('Email resent.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to resend email') } finally { setBusy(false) } }
  async function overrideStatus() { if (!overridePassword.trim() || !overrideToStatus) { setError('Admin password and target status are required.'); return }; setBusy(true); setError(''); try { await api.post(`/cases/${id}/override-status`, { admin_password: overridePassword, to_status: overrideToStatus, note: overrideNote || null }); setOverridePassword(''); setOverrideNote(''); await load(); setSuccess('Status overridden.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to override status') } finally { setBusy(false) } }
  async function addInternalNote() { const content = newNote.trim(); if (!content) return; setBusy(true); setError(''); try { await api.post(`/cases/${id}/notes`, { content }); setNewNote(''); await load(); setSuccess('Internal note added.') } catch (e) { setError(e?.response?.data?.detail || 'Failed to add note') } finally { setBusy(false) } }
  async function deleteCase() {
    if (!window.confirm(`Permanently delete case ${data?.reference_number || ''} and ALL its data (survey, quotes, permit, installation, photos, payments…)? This cannot be undone.`)) return
    setBusy(true); setError('')
    try { await api.delete(`/cases/${id}`); nav('/admin/cases') }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to delete case'); setBusy(false) }
  }

  const signature = data?.active_quote?.signature || null

  return (
    <AdminShell>
      <ImageModal open={!!preview} onClose={() => setPreview(null)} src={preview?.src} title={preview?.title} subtitle={preview?.subtitle} />
      <div className="animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">
              <Link className="text-sky-600 hover:underline" to="/admin/cases">Cases</Link> / {data?.reference_number || id}
            </div>
            <h1 className="mt-1 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900">
              {data?.reference_number || 'Case'}
              {data?.status ? <StatusTag status={data.status} /> : null}
            </h1>
          </div>
          {data ? (
            <button
              type="button"
              disabled={busy}
              onClick={deleteCase}
              className="cursor-pointer rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              Delete case
            </button>
          ) : null}
        </div>

        {loading && (
          <div className="mt-5 space-y-4">
            <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        )}
        {/* Toasts — fixed bottom-right so action feedback is visible regardless of scroll/tab */}
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2">
          {error && (
            <div className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 shadow-lg ring-1 ring-rose-500/5">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth="2.2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zM12 15.75h.007v.008H12v-.008z" /></svg>
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError('')} className="-mr-1 -mt-0.5 shrink-0 rounded-md px-1 text-rose-400 transition-colors hover:text-rose-600" aria-label="Dismiss">✕</button>
            </div>
          )}
          {success && (
            <div className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg ring-1 ring-emerald-500/5">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth="2.2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="flex-1">{success}</span>
              <button type="button" onClick={() => setSuccess('')} className="-mr-1 -mt-0.5 shrink-0 rounded-md px-1 text-emerald-400 transition-colors hover:text-emerald-600" aria-label="Dismiss">✕</button>
            </div>
          )}
        </div>

        {data && (
          <>
            <CaseFlowHeader data={data} installation={installation} onGoTo={setTab} />
            {/* Tab bar */}
            <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`cursor-pointer whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {/* Overview */}
              {tab === 'overview' && (
                <>
                <SectionCard tone="slate" title="Lifecycle" subtitle="Where this case is in the flow">
                  <StageFlow
                    status={data.status}
                    details={{
                      survey: data.survey_scheduled_date ? (isAtOrAfter(data.status, 'survey_completed') ? 'Completed' : 'Scheduled') : (data.survey_request_status === 'pending' ? 'Time requested' : undefined),
                      permit: permit?.status ? `Permit: ${permit.status}` : undefined,
                      install: installation?.completed_at ? 'Installed' : installation?.scheduled_date ? 'Scheduled' : (installation?.request_status === 'pending' ? 'Time requested' : undefined),
                    }}
                  />
                </SectionCard>
                <SectionCard tone="slate" title="Customer" subtitle="People & case basics">
                  <div className="grid gap-2 text-sm">
                    <div><span className="text-slate-500">Nickname:</span> <span className="font-semibold text-slate-900">{data.customer.nickname}</span></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-semibold text-slate-900">{data.customer.phone}</span></div>
                    <div><span className="text-slate-500">Email:</span> <span className="font-semibold text-slate-900">{data.customer.email}</span></div>
                    <div><span className="text-slate-500">Address:</span> <span className="font-semibold text-slate-900">{data.install_address}</span></div>
                    <div><span className="text-slate-500">Charger:</span> <span className="font-semibold text-slate-900">{data.charger_brand || '—'}</span></div>
                    <div><span className="text-slate-500">EV:</span> <span className="font-semibold text-slate-900">{data.ev_brand || '—'}</span></div>
                    <div><span className="text-slate-500">Status:</span> <StatusTag status={data.status} /></div>
                    {data.notes && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Customer notes</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{data.notes}</div>
                      </div>
                    )}
                    {tokenLink && (
                      <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer link</div><div className="mt-1 break-all text-xs text-slate-700">{tokenLink}</div></div>
                    )}
                  </div>
                </SectionCard>
                </>
              )}

              {/* Survey */}
              {tab === 'survey' && (
                <SectionCard tone="teal" title="Survey" subtitle="Step 1 — Schedule & complete site survey">
                  {isAtOrAfter(data.status, 'survey_completed') && (
                    <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-800">Completed — locked to prevent mistakes.</div>
                  )}
                  {data.survey_request_status === 'pending' && data.survey_requested_date && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs">
                      <div className="font-semibold text-amber-900">Customer requested survey time</div>
                      <div className="mt-1 text-amber-800">{new Date(data.survey_requested_date).toLocaleString()}</div>
                      {data.survey_request_note && <div className="mt-1 text-amber-700">Note: {data.survey_request_note}</div>}
                    </div>
                  )}
                  {data.survey_request_status === 'rejected' && data.survey_request_admin_note && (
                    <div className="mb-3 rounded-xl border bg-slate-50 px-3.5 py-2.5 text-xs"><div className="font-semibold text-slate-700">Last rejection</div><div className="mt-1 text-slate-600">{data.survey_request_admin_note}</div></div>
                  )}
                  {!data.survey_scheduled_date && !data.survey_requested_date && (
                    <div className="mb-3 rounded-xl border bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">Waiting for customer to choose a survey time.</div>
                  )}
                  <div className="text-sm text-slate-700">Scheduled: <span className="font-semibold">{data.survey_scheduled_date ? new Date(data.survey_scheduled_date).toLocaleString() : '—'}</span></div>
                  <div className="mt-1 text-sm text-slate-700">Deposit: <Pill tone={data.survey_deposit_paid ? 'emerald' : 'slate'}>{data.survey_deposit_paid ? 'Paid' : 'Not paid'}</Pill> {data.survey_deposit_amount ? <span className="text-slate-500">({money(data.survey_deposit_amount)})</span> : null}</div>
                  {depositReportedAt && <div className="mt-1 text-xs text-amber-700">Customer reported e-transfer: {new Date(depositReportedAt).toLocaleString()}</div>}

                  <button type="button" disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !data.survey_scheduled_date || data.survey_deposit_paid} onClick={markDepositPaid} className={`mt-4 w-full ${btnPrimary}`}>Mark deposit paid (e-transfer)</button>

                  <label className="mt-4 block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Survey notes (internal)</span><textarea value={surveyNotes} onChange={(e) => setSurveyNotes(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'survey_completed')} className={textareaCls} rows={3} placeholder="What you found on site…" /></label>
                  <button type="button" disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !data.survey_scheduled_date} onClick={completeSurvey} className={`mt-3 w-full ${btnCTA}`}>Complete survey (unlock quote)</button>

                  <label className="mt-4 block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule (local time)</span><input type="datetime-local" value={surveyDt} onChange={(e) => setSurveyDt(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !(data.survey_request_status === 'pending' && data.survey_requested_date)} className={inputCls} /></label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !surveyDt || !(data.survey_request_status === 'pending' && data.survey_requested_date)} onClick={scheduleSurvey} className={`flex-1 ${btnCTA}`}>Confirm requested time</button>
                    <button type="button" disabled={busy || !(data.survey_request_status === 'pending' && data.survey_requested_date)} onClick={rejectSurveyRequest} className={btnOutline}>Reject</button>
                  </div>
                  {data.survey_request_status === 'pending' && data.survey_requested_date && (
                    <label className="mt-3 block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rejection reason (sent to customer)</span><input value={surveyRejectNote} onChange={(e) => setSurveyRejectNote(e.target.value)} disabled={busy} className={inputCls} placeholder="Optional." /></label>
                  )}

                  <LockedSection locked={!canUploadSurveyPhotos(data.status)} reason="Survey photos unlock after the survey is completed.">
                    <div className="mt-5 rounded-xl border bg-slate-50 p-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Survey photos</span>
                      <div className="mt-3 grid gap-2">
                        <select value={surveyPhotoCategory} onChange={(e) => setSurveyPhotoCategory(e.target.value)} className={selectCls + ' mt-0'}>
                          <option value="panel_front">panel_front</option><option value="panel_inside">panel_inside</option><option value="meter">meter</option><option value="install_location">install_location</option><option value="wiring_path">wiring_path</option><option value="other">other</option>
                        </select>
                        <input value={surveyPhotoCaption} onChange={(e) => setSurveyPhotoCaption(e.target.value)} className={inputCls + ' mt-0'} placeholder="caption (optional)" />
                        <input type="file" accept="image/*" multiple onChange={(e) => setSurveyPhotoFile(e.target.files)} className="text-sm" />
                        <button type="button" disabled={busy || !surveyPhotoFile?.length} onClick={uploadSurveyPhoto} className={btnPrimary}>
                          {surveyPhotoFile?.length > 1 ? `Upload ${surveyPhotoFile.length} photos` : 'Upload photo'}
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {surveyPhotos.map((p) => (
                          <div key={p.id} className="overflow-hidden rounded-xl border bg-white">
                            <button type="button" onClick={() => setPreview({ src: `/${p.file_path}`, title: p.file_name || p.category || 'Survey photo', subtitle: p.caption || p.category })} className="block w-full bg-slate-50" title="Click to preview">
                              <img src={`/${p.file_path}`} alt={p.file_name} className="h-28 w-full object-cover" />
                            </button>
                            <div className="p-2">
                              <div className="truncate text-xs font-semibold text-slate-600">{p.category}</div>
                              {p.caption ? <div className="truncate text-[11px] text-slate-500">{p.caption}</div> : null}
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                                <button type="button" disabled={busy} onClick={() => deleteSurveyPhoto(p.id)} className="rounded-lg border bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-60">Delete</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {surveyPhotos.length === 0 && <div className="col-span-full py-4 text-center text-xs text-slate-400">No photos.</div>}
                      </div>
                    </div>
                  </LockedSection>
                </SectionCard>
              )}

              {/* Quote */}
              {tab === 'quote' && (
                <LockedSection locked={!canCreateOrEditQuote(data.status)} reason="Quote unlocks after the survey is completed.">
                  <SectionCard tone="amber" title="Quote" subtitle="Step 2 — Build & send quote"
                    right={data.active_quote ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={previewQuote} className={btnOutline}>Preview</button>
                        <button type="button" disabled={busy} onClick={sendQuote} className={btnPrimary}>Send active quote</button>
                      </div>
                    ) : null}
                  >
                    {data.active_quote ? (
                      <div className="grid gap-2 rounded-xl border bg-slate-50 p-4 text-sm">
                        <div className="flex items-center justify-between"><span className="text-slate-500">Version</span><span className="font-bold text-slate-900">v{data.active_quote.version}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">Total</span><span className="font-bold text-slate-900">{money(data.active_quote.total)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-500">Approved</span><Pill tone={data.active_quote.signature ? 'emerald' : 'slate'}>{data.active_quote.signature ? 'yes' : 'no'}</Pill></div>
                        <div className="text-xs text-slate-500">Sent: {data.active_quote.sent_at ? new Date(data.active_quote.sent_at).toLocaleString() : '—'}</div>
                        {data.active_quote.signature && <div className="text-xs text-slate-500">Signature details are in the <button type="button" className="font-semibold text-sky-600 hover:underline" onClick={() => setTab('signature')}>Signature</button> tab.</div>}
                      </div>
                    ) : <div className="py-2 text-sm text-slate-500">No active quote yet.</div>}

                    <div className="mt-5 grid gap-3 md:grid-cols-6">
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Install type</span><select value={installType} onChange={(e) => setInstallType(e.target.value)} className={selectCls}><option value="surface_mount">surface_mount</option><option value="concealed">concealed</option></select></label>
                      <Field label="Base price" value={basePrice} onChange={setBasePrice} />
                      <Field label="Extra meters" value={extraMeters} onChange={setExtraMeters} />
                      <Field label="Extra rate" value={extraRate} onChange={setExtraRate} />
                      <Field label="Permit fee" value={permitFee} onChange={setPermitFee} />
                      <Field label="Survey credit" value={surveyCredit} onChange={setSurveyCredit} />
                      <Field label="Addon name" value={addonName} onChange={setAddonName} />
                      <Field label="Addon price" value={addonPrice} onChange={setAddonPrice} />
                      <div className="md:col-span-6"><button type="button" disabled={busy} onClick={createQuote} className={btnCTA}>Create new quote version</button></div>
                    </div>
                  </SectionCard>
                </LockedSection>
              )}

              {/* Permit */}
              {tab === 'permit' && (
                <LockedSection locked={!canEditPermit(data.status)} reason="Permit unlocks after customer approves the quote.">
                  <SectionCard tone="indigo" title="Permit" subtitle="Step 3 — Permit tracking">
                    {isAtOrAfter(data.status, 'permit_approved') && <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-800">Approved — locked to prevent mistakes.</div>}
                    <div className="grid gap-3 md:grid-cols-6">
                      <Field label="Permit number" value={permitNumber} onChange={setPermitNumber} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} />
                      <label className="block md:col-span-1"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span><select value={permitStatus} onChange={(e) => setPermitStatus(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} className={selectCls}><option value="applied">applied</option><option value="approved">approved</option><option value="revision_required">revision_required</option></select><div className="mt-1 text-xs text-slate-400">Change here, then save.</div></label>
                      <label className="block md:col-span-1"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applied</span><input type="date" value={permitAppliedDate || ''} onChange={(e) => setPermitAppliedDate(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} className={inputCls} /></label>
                      <label className="block md:col-span-1"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected approval</span><input type="date" value={permitExpectedDate || ''} onChange={(e) => setPermitExpectedDate(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} className={inputCls} /></label>
                      <label className="block md:col-span-1"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Actual approval</span><input type="date" value={permitActualDate || ''} onChange={(e) => setPermitActualDate(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} className={inputCls} /></label>
                      <label className="block md:col-span-6"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</span><textarea value={permitNotes} onChange={(e) => setPermitNotes(e.target.value)} disabled={busy || isAtOrAfter(data.status, 'permit_approved')} className={textareaCls} rows={3} /></label>
                      <div className="md:col-span-6 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={busy || isAtOrAfter(data.status, 'permit_approved')} onClick={savePermit} className={btnCTA}>Save permit</button>
                        <span className="text-xs text-slate-400">Current: {permit ? `permit_id=${permit.id}` : 'none'}</span>
                      </div>
                      <div className="md:col-span-6 rounded-xl border bg-slate-50 p-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Attachments</span>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input type="file" disabled={busy || isAtOrAfter(data.status, 'permit_approved')} onChange={(e) => setPermitFile(e.target.files?.[0] || null)} className="text-sm disabled:opacity-60" />
                          <button type="button" disabled={busy || isAtOrAfter(data.status, 'permit_approved') || !permitFile || !permit?.id} onClick={uploadPermitAttachment} className={btnPrimary}>Upload</button>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {(permit?.attachments || []).map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5">
                              <div className="min-w-0"><a className="block truncate font-semibold text-sky-600 hover:underline" href={`/${a.file_path}`} target="_blank" rel="noreferrer">{a.file_name}</a><div className="text-xs text-slate-400">{a.file_path}</div></div>
                              {isPreviewableImageFileName(a.file_name) && <button type="button" className="shrink-0 overflow-hidden rounded-lg border bg-slate-50" title="Preview" onClick={() => setPreview({ src: `/${a.file_path}`, title: a.file_name || 'Attachment', subtitle: 'Permit attachment' })}><img src={`/${a.file_path}`} alt={a.file_name} className="h-10 w-14 object-cover" /></button>}
                            </div>
                          ))}
                          {(permit?.attachments || []).length === 0 && <div className="py-2 text-xs text-slate-400">No attachments.</div>}
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </LockedSection>
              )}

              {/* Installation */}
              {tab === 'install' && (
                <LockedSection locked={!canEditInstallation(data.status)} reason="Installation unlocks after permit is approved.">
                  <SectionCard tone="emerald" title="Installation" subtitle="Step 4 — Schedule & complete install">
                    {isAtOrAfter(data.status, 'installed') && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">Installed — scheduling locked. You can still edit the report and photos.</div>}
                    {installation?.request_status === 'pending' && installation?.requested_date && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs"><div className="font-semibold text-amber-900">Customer requested installation time</div><div className="mt-1 text-amber-800">{new Date(installation.requested_date).toLocaleString()}</div>{installation?.request_note && <div className="mt-1 text-amber-700">Note: {installation.request_note}</div>}</div>}
                    {installation?.request_status === 'rejected' && installation?.admin_note && <div className="mb-4 rounded-xl border bg-slate-50 px-3.5 py-2.5 text-xs"><div className="font-semibold text-slate-700">Last rejection</div><div className="mt-1 text-slate-600">{installation.admin_note}</div></div>}
                    {!isAtOrAfter(data.status, 'installed') && !installation?.scheduled_date && !installation?.requested_date && <div className="mb-4 rounded-xl border bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">Waiting for customer to choose an installation time.</div>}
                    {installationDateIssue && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">Date issue: completed time is earlier than scheduled time.</div>}

                    <div className="grid gap-2 text-sm text-slate-700">
                      <div>Scheduled: <span className="font-semibold">{installation?.scheduled_date ? new Date(installation.scheduled_date).toLocaleString() : '—'}</span></div>
                      <div>Completed: <span className="font-semibold">{installation?.completed_at ? new Date(installation.completed_at).toLocaleString() : '—'}</span></div>
                      <div className="flex items-center justify-between"><span>Completion email</span><Pill tone={installation?.completion_email_sent ? 'emerald' : 'amber'}>{installation?.completion_email_sent ? 'sent' : 'pending'}</Pill></div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule (local)</span><input type="datetime-local" value={installDt} onChange={(e) => setInstallDt(e.target.value)} disabled={busy || (isAtOrAfter(data.status, 'installed') && !installationDateIssue) || (!installationDateIssue && !(installation?.request_status === 'pending' && installation?.requested_date))} className={inputCls} /></label>
                      <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</span><input value={installNotes} onChange={(e) => setInstallNotes(e.target.value)} disabled={busy || (isAtOrAfter(data.status, 'installed') && !installationDateIssue)} className={inputCls} /></label>
                      {hasPendingInstallRequest && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">Pending reschedule request — confirm or reject first.</div>}
                      {installationScheduledInFuture && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">Too early to mark installed — scheduled time is in the future.</div>}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy || (isAtOrAfter(data.status, 'installed') && !installationDateIssue) || !installDt || (!installationDateIssue && !(installation?.request_status === 'pending' && installation?.requested_date))} onClick={scheduleInstallation} className={btnCTA}>{isAtOrAfter(data.status, 'installed') ? 'Fix schedule' : 'Confirm requested time'}</button>
                        <button type="button" disabled={busy || !(installation?.request_status === 'pending' && installation?.requested_date)} onClick={rejectInstallationRequest} className={btnOutline}>Reject</button>
                        <button type="button" disabled={busy || !canMarkInstalled(data.status) || installationScheduledInFuture || hasPendingInstallRequest} onClick={completeInstallation} className={btnPrimary}>Mark installed</button>
                        <button type="button" disabled={busy || data.status !== 'installed'} onClick={sendInstallationReport} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-800 active:scale-95 disabled:opacity-60">Send install report</button>
                        <button type="button" disabled={busy || (data.status !== 'installed' && data.status !== 'completed')} onClick={sendCompletionEmail} className={btnOutline}>Send completion email</button>
                      </div>
                      {installation?.request_status === 'pending' && installation?.requested_date && <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rejection reason (sent to customer)</span><input value={installRejectNote} onChange={(e) => setInstallRejectNote(e.target.value)} disabled={busy} className={inputCls} placeholder="Optional." /></label>}
                    </div>

                    {/* Installation report */}
                    <div className="mt-5 grid gap-3 md:grid-cols-6">
                      <label className="block md:col-span-6"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Installed items (report)</span><textarea value={installReportInstalledItems} onChange={(e) => setInstallReportInstalledItems(e.target.value)} className={textareaCls} rows={3} placeholder="What was installed, where…" /></label>
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Wire gauge</span><input value={installReportWireGauge} onChange={(e) => setInstallReportWireGauge(e.target.value)} className={inputCls} placeholder="e.g. 6 AWG" /></label>
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Max charging amps</span><input value={installReportMaxAmps} onChange={(e) => setInstallReportMaxAmps(e.target.value.replace(/[^\d]/g, ''))} className={inputCls} placeholder="e.g. 40" /></label>
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Test result</span><div className="mt-2.5 flex items-center gap-2 text-sm"><input type="checkbox" checked={installReportTestPassed} onChange={(e) => setInstallReportTestPassed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /><span className="text-slate-700">PASS</span></div></label>
                      <label className="block md:col-span-6"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Testing notes</span><textarea value={installReportTestNotes} onChange={(e) => setInstallReportTestNotes(e.target.value)} className={textareaCls} rows={3} placeholder="Testing steps, measurements…" /></label>
                      <div className="md:col-span-6"><button type="button" disabled={busy} onClick={saveInstallationReport} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-800 active:scale-95 disabled:opacity-60">Save report fields</button></div>
                    </div>

                    {/* Installation photos */}
                    <div className="mt-5 rounded-xl border bg-slate-50 p-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Installation photos (report)</span>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input value={installPhotoCaption} onChange={(e) => setInstallPhotoCaption(e.target.value)} className={inputCls + ' mt-0'} placeholder="caption applied to all (optional)" />
                        <input type="file" accept="image/*" multiple onChange={(e) => setInstallPhotoFile(e.target.files)} className="text-sm" />
                        <button type="button" disabled={busy || !installPhotoFile?.length} onClick={uploadInstallationPhoto} className={`${btnPrimary} sm:col-span-2`}>
                          {installPhotoFile?.length > 1 ? `Upload ${installPhotoFile.length} photos` : 'Upload photo'}
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {installPhotos.map((p) => (
                          <div key={p.id} className="overflow-hidden rounded-xl border bg-white">
                            <button type="button" onClick={() => setPreview({ src: `/${p.file_path}`, title: p.file_name || 'Installation photo', subtitle: p.caption || 'Installation photo' })} className="block w-full bg-slate-50" title="Click to preview">
                              <img src={`/${p.file_path}`} alt={p.file_name} className="h-28 w-full object-cover" />
                            </button>
                            <div className="p-2">
                              {p.caption ? <div className="truncate text-xs text-slate-600">{p.caption}</div> : null}
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                                <button type="button" disabled={busy} onClick={() => deleteInstallationPhoto(p.id)} className="rounded-lg border bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-60">Delete</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {installPhotos.length === 0 && <div className="col-span-full py-4 text-center text-xs text-slate-400">No photos.</div>}
                      </div>
                    </div>
                  </SectionCard>
                </LockedSection>
              )}

              {/* Files (attachment center) */}
              {tab === 'files' && <AttachmentsTab caseId={id} onPreview={setPreview} />}

              {/* BOM */}
              {tab === 'bom' && <BomTab caseId={id} onChanged={load} />}

              {/* Finance */}
              {tab === 'finance' && <FinanceTab caseId={id} />}

              {/* Signature (legal record) */}
              {tab === 'signature' && (
                <SectionCard tone="emerald" title="Signature record" subtitle="Customer's signed approval — legal record">
                  {signature ? (
                    <div className="grid gap-3 text-sm">
                      <div><span className="text-slate-500">Signed by:</span> <span className="font-semibold text-slate-900">{signature.signed_name}</span></div>
                      <div><span className="text-slate-500">Signed at:</span> <span className="font-semibold text-slate-900">{new Date(signature.signed_at).toLocaleString()}</span></div>
                      {signature.ip_address && <div><span className="text-slate-500">IP:</span> <span className="font-mono text-slate-700">{signature.ip_address}</span></div>}
                      <div><span className="text-slate-500">Language signed under:</span> <Pill tone="teal">{signature.signed_language ? (signature.signed_language === 'zh' ? '中文 (zh)' : 'English (en)') : 'unknown'}</Pill></div>
                      {String(signature.signature_data || '').startsWith('data:image') && (
                        <div className="rounded-xl border bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Signature</div>
                          <img alt="Signature" src={signature.signature_data} className="mt-2 max-h-40 w-full rounded-xl border bg-white object-contain" />
                        </div>
                      )}
                      {signature.terms_snapshot && (
                        <div className="rounded-xl border bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Terms the customer agreed to (exact text shown at signing)</div>
                          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">{signature.terms_snapshot}</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-slate-400">No signature yet — the customer hasn't approved the quote.</div>
                  )}
                </SectionCard>
              )}

              {/* Activity (timeline + notes + notifications + override) */}
              {tab === 'activity' && (
                <>
                  <SectionCard tone="slate" title="Timeline" subtitle="History & status changes">
                    {timeline.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">No timeline.</div> : (
                      <div className="space-y-2">
                        {timeline.map((t) => (
                          <div key={t.id} className="rounded-xl border bg-slate-50/70 px-4 py-3 text-sm transition-colors hover:bg-slate-100">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</span>
                              <Pill tone={toneForTimelineRow(t)}>{t.to_status}</Pill>
                            </div>
                            <div className="mt-1 text-slate-700"><span className="text-slate-400">{t.from_status || '—'}</span> <span className="mx-1 text-slate-300">→</span> <span className="font-semibold">{t.to_status}</span></div>
                            {t.note && <div className="mt-1 text-xs text-slate-500">{t.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard tone="slate" title="Internal notes" subtitle="Team-only notes">
                    <div className="flex gap-2">
                      <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className={`flex-1 ${inputCls} mt-0`} placeholder="Add a note…" />
                      <button type="button" disabled={busy || !newNote.trim()} onClick={addInternalNote} className={btnPrimary}>Add</button>
                    </div>
                    {notes.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {notes.map((n) => (
                          <div key={n.id} className="rounded-xl border bg-slate-50/70 px-4 py-3 text-sm transition-colors hover:bg-slate-100">
                            <div className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                            <div className="mt-1 text-slate-800">{n.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {notes.length === 0 && <div className="mt-3 py-4 text-center text-sm text-slate-400">No notes.</div>}
                  </SectionCard>

                  <SectionCard tone="slate" title="Notifications" subtitle="Email/SMS delivery log">
                    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
                      <label className="block flex-1 min-w-[240px]"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resend email to (optional)</span><input value={resendEmailTo} onChange={(e) => setResendEmailTo(e.target.value)} className={inputCls + ' mt-0'} placeholder="leave blank for original recipient" /></label>
                      <span className="text-xs text-slate-400">If Gmail drops, resend to another inbox.</span>
                    </div>
                    {notifications.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">No notifications.</div> : (
                      <div className="overflow-auto rounded-xl border">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-3">When</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th><th className="px-3 py-3">Error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {notifications.map((n) => (
                              <tr key={n.id} className="transition-colors hover:bg-slate-50">
                                <td className="px-3 py-3 text-xs">{new Date(n.created_at).toLocaleString()}</td>
                                <td className="px-3 py-3">{n.channel}</td>
                                <td className="px-3 py-3 text-xs">{n.recipient}</td>
                                <td className="px-3 py-3">{n.template_name}</td>
                                <td className="px-3 py-3">{n.status}</td>
                                <td className="px-3 py-3">{n.channel === 'email' && <button type="button" disabled={busy} onClick={() => resendEmail(n.id)} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60">Resend</button>}</td>
                                <td className="px-3 py-3 text-xs text-slate-500">{n.error_message || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard tone="rose" title="Admin override (password required)" subtitle="Emergency fixes — logs history and notifies customer via SMS">
                    <div className="grid gap-3 md:grid-cols-6">
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Admin password</span><input type="password" value={overridePassword} onChange={(e) => setOverridePassword(e.target.value)} className={inputCls + ' focus:border-rose-500 focus:ring-rose-500/20'} placeholder="Required" /></label>
                      <label className="block md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Set case status to</span><select value={overrideToStatus} onChange={(e) => setOverrideToStatus(e.target.value)} className={selectCls + ' focus:border-rose-500 focus:ring-rose-500/20'}>
                        {CASE_STATUS_ORDER.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                        <option value="lost">{statusLabel('lost')}</option>
                      </select></label>
                      <label className="block md:col-span-6"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Override note (shown in timeline)</span><textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} className={textareaCls + ' focus:border-rose-500 focus:ring-rose-500/20'} rows={2} placeholder="Why are you overriding?" /></label>
                      <div className="md:col-span-6">
                        <button type="button" disabled={busy || !overridePassword.trim() || !overrideToStatus} onClick={overrideStatus} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-60">Apply override</button>
                        <p className="mt-2 text-xs text-slate-400">Bypasses normal workflow locks. Use only for emergency fixes.</p>
                      </div>
                    </div>
                  </SectionCard>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}

function Field({ label, value, onChange, disabled = false }) {
  return (
    <label className="block md:col-span-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls} />
    </label>
  )
}

function ImageModal({ open, onClose, src, title, subtitle }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" aria-label="Close preview" onClick={onClose} />
      <div className="relative mx-auto flex h-full max-w-5xl items-center justify-center p-4">
        <div role="dialog" aria-modal="true" className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl animate-slide-up">
          <div className="flex items-start justify-between gap-3 border-b bg-slate-50 px-5 py-4">
            <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{title || 'Preview'}</div>{subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}</div>
            <div className="flex shrink-0 items-center gap-2">
              {src && <a href={src} target="_blank" rel="noreferrer" className={btnOutline + ' py-2'}>Open</a>}
              <button type="button" onClick={onClose} className={btnPrimary}>Close</button>
            </div>
          </div>
          <div className="bg-slate-100 p-4">
            {src ? <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl bg-white p-3"><img src={src} alt={title || 'Preview'} className="max-h-[70vh] w-auto max-w-full object-contain" /></div> : <div className="rounded-xl bg-white p-6 text-sm text-slate-500">No preview.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
