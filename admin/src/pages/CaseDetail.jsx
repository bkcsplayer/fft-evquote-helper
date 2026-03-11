import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
import {
  canCreateOrEditQuote,
  canEditInstallation,
  canEditPermit,
  canMarkInstalled,
  canUploadSurveyPhotos,
  isAtOrAfter,
  toneForCaseStatus,
} from '../utils/caseStatus.js'

const SECTION_TONES = {
  slate: {
    border: 'border-slate-200',
    headerBg: 'bg-slate-50',
    headerText: 'text-slate-700',
    cardBg: 'bg-white',
  },
  teal: {
    border: 'border-teal-200',
    headerBg: 'bg-teal-50',
    headerText: 'text-teal-800',
    cardBg: 'bg-teal-50/40',
  },
  amber: {
    border: 'border-amber-200',
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-900',
    cardBg: 'bg-amber-50/40',
  },
  emerald: {
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-50',
    headerText: 'text-emerald-900',
    cardBg: 'bg-emerald-50/35',
  },
  indigo: {
    border: 'border-indigo-200',
    headerBg: 'bg-indigo-50',
    headerText: 'text-indigo-900',
    cardBg: 'bg-indigo-50/35',
  },
  rose: {
    border: 'border-rose-200',
    headerBg: 'bg-rose-50',
    headerText: 'text-rose-900',
    cardBg: 'bg-rose-50/35',
  },
}

function SectionCard({ tone = 'slate', title, subtitle, right, className = '', children }) {
  const s = SECTION_TONES[tone] || SECTION_TONES.slate
  return (
    <div className={`${className} overflow-hidden rounded-2xl border ${s.border} ${s.cardBg} shadow-sm`}>
      <div className={`flex items-start justify-between gap-3 px-4 py-3 ${s.headerBg}`}>
        <div className="min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wider ${s.headerText}`}>{title}</div>
          {subtitle ? <div className="mt-0.5 text-xs text-slate-600">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function LockedSection({ locked, reason, children }) {
  if (!locked) return children
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-50">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/40 backdrop-blur-[1px]">
        <div className="max-w-md rounded-xl border bg-white px-4 py-3 text-center text-sm text-slate-800 shadow-sm">
          <div className="font-semibold">Locked</div>
          <div className="mt-1 text-slate-600">{reason}</div>
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

export default function CaseDetail() {
  const { id } = useParams()
  const loc = useLocation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const [preview, setPreview] = useState(null) // { src, title, subtitle }

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
    setLoading(true)
    setError('')
    try {
      const [res, p, inst, photos, instPhotos, tl, ns, notesRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get(`/cases/${id}/permit`),
        api.get(`/cases/${id}/installation`),
        api.get(`/cases/${id}/survey/photos`),
        api.get(`/cases/${id}/installation/photos`),
        api.get(`/cases/${id}/timeline`),
        api.get(`/cases/${id}/notifications`),
        api.get(`/cases/${id}/notes`),
      ])

      setData(res.data)
      setPermit(p.data || null)
      setInstallation(inst.data || null)
      setSurveyPhotos(photos.data || [])
      setInstallPhotos(instPhotos.data || [])
      setTimeline(tl.data || [])
      setNotifications(ns.data || [])
      setNotes(notesRes.data || [])

      // Pre-fill survey scheduling input from customer-requested time (preferred) or existing schedule
      try {
        const src = res.data?.survey_requested_date || res.data?.survey_scheduled_date
        if (src) {
          const d = new Date(src)
          const pad = (n) => String(n).padStart(2, '0')
          setSurveyDt(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          )
        } else {
          setSurveyDt('')
        }
      } catch {
        setSurveyDt('')
      }

      if (p.data) {
        setPermitNumber(p.data.permit_number || '')
        setPermitStatus(p.data.status || 'applied')
        setPermitAppliedDate(p.data.applied_date || '')
        setPermitExpectedDate(p.data.expected_approval_date || '')
        setPermitActualDate(p.data.actual_approval_date || '')
        setPermitNotes(p.data.notes || '')
      } else {
        setPermitNumber('')
        setPermitStatus('applied')
        setPermitAppliedDate('')
        setPermitExpectedDate('')
        setPermitActualDate('')
        setPermitNotes('')
      }

      if (inst.data) {
        // Populate scheduling fields (and support fixing inconsistent dates)
        try {
          const src =
            inst.data.request_status === 'pending' && inst.data.requested_date ? inst.data.requested_date : inst.data.scheduled_date
          if (src) {
            const d = new Date(src)
            const pad = (n) => String(n).padStart(2, '0')
            setInstallDt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
          } else {
            setInstallDt('')
          }
        } catch {
          setInstallDt('')
        }
        setInstallNotes(inst.data.notes || '')

        setInstallReportInstalledItems(inst.data.installed_items || '')
        setInstallReportWireGauge(inst.data.wire_gauge || '')
        setInstallReportMaxAmps(inst.data.max_charging_amps == null ? '' : String(inst.data.max_charging_amps))
        setInstallReportTestPassed(!!inst.data.test_passed)
        setInstallReportTestNotes(inst.data.test_notes || '')
      } else {
        setInstallDt('')
        setInstallNotes('')
        setInstallReportInstalledItems('')
        setInstallReportWireGauge('')
        setInstallReportMaxAmps('')
        setInstallReportTestPassed(false)
        setInstallReportTestNotes('')
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load case')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (data?.status) setOverrideToStatus(String(data.status))
  }, [data?.status])

  useEffect(() => {
    if (!preview) return
    const onKey = (e) => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 4500)
    return () => clearTimeout(t)
  }, [success])

  useEffect(() => {
    if (loading) return
    const hash = (loc.hash || '').toLowerCase()
    if (!hash) return
    const targetId = hash.replace('#', '').trim()
    if (!targetId) return
    const el = document.getElementById(targetId)
    if (!el) return
    // Allow layout to settle before scrolling
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [loading, loc.hash])

  const tokenLink = useMemo(() => {
    const token = data?.access_token
    if (!token) return null
    try {
      const u = new URL(window.location.origin)
      const isLocal =
        u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.toLowerCase().endsWith('.local')
      if (isLocal) {
        if (u.port === '7221') u.port = '7220'
        if (u.port === '7231') u.port = '7230'
      }
      return `${u.toString().replace(/\/$/, '')}/quote/status/${token}`
    } catch {
      return `http://localhost:7220/quote/status/${token}`
    }
  }, [data])

  const installationScheduledInFuture = useMemo(() => {
    try {
      const sd = installation?.scheduled_date
      if (!sd) return false
      return new Date(sd).getTime() > Date.now()
    } catch {
      return false
    }
  }, [installation?.scheduled_date])

  const hasPendingInstallRequest = useMemo(() => {
    const rs = String(installation?.request_status || '').trim()
    return rs === 'pending' && !!installation?.requested_date
  }, [installation?.request_status, installation?.requested_date])

  const installationDateIssue = useMemo(() => {
    try {
      if (!installation?.completed_at || !installation?.scheduled_date) return false
      return new Date(installation.completed_at).getTime() < new Date(installation.scheduled_date).getTime()
    } catch {
      return false
    }
  }, [installation?.completed_at, installation?.scheduled_date])

  const depositReportedAt = useMemo(() => {
    const rows = timeline || []
    // timeline entries are oldest→newest; take latest match for safety
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i]?.note === 'Customer reported e-transfer sent') return rows[i]?.created_at || null
    }
    return null
  }, [timeline])

  function toneForTimelineRow(row) {
    const note = String(row?.note || '')
    const to = String(row?.to_status || '')
    if (note.includes('Deposit marked paid')) return 'emerald'
    if (note.includes('Customer reported e-transfer')) return 'amber'
    if (note.includes('Completion email sent')) return 'emerald'
    if (note.includes('Installation completed')) return 'emerald'
    if (note.includes('Permit approved')) return 'emerald'
    if (note.toLowerCase().includes('revision')) return 'amber'
    if (to === 'cancelled') return 'rose'
    if (to === 'customer_approved') return 'emerald'
    if (to === 'quoted') return 'teal'
    if (to === 'installation_scheduled') return 'teal'
    return 'slate'
  }

  async function scheduleSurvey() {
    if (!surveyDt) return
    setBusy(true)
    try {
      await api.post(`/cases/${id}/survey/schedule`, { scheduled_date: new Date(surveyDt).toISOString() })
      await load()
      setSuccess('Survey scheduled.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to schedule survey')
    } finally {
      setBusy(false)
    }
  }

  async function rejectSurveyRequest() {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/cases/${id}/survey/request/reject`, { note: surveyRejectNote.trim() || null })
      setSurveyRejectNote('')
      await load()
      setSuccess('Survey request rejected — customer will choose again.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to reject survey request')
    } finally {
      setBusy(false)
    }
  }

  async function completeSurvey() {
    setBusy(true)
    setError('')
    try {
      await api.patch(`/cases/${id}/survey/complete`, { survey_notes: surveyNotes.trim() || null })
      setSurveyNotes('')
      await load()
      // Make the next step obvious after completing survey
      setTimeout(() => document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to complete survey')
    } finally {
      setBusy(false)
    }
  }

  async function markDepositPaid() {
    setBusy(true)
    setError('')
    try {
      await api.patch(`/cases/${id}/survey/deposit-paid`, { note: 'Deposit marked paid (e-transfer)' })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to mark deposit paid')
    } finally {
      setBusy(false)
    }
  }

  async function uploadSurveyPhoto() {
    if (!surveyPhotoFile) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', surveyPhotoFile)
      const qp = new URLSearchParams()
      qp.set('category', surveyPhotoCategory)
      if (surveyPhotoCaption.trim()) qp.set('caption', surveyPhotoCaption.trim())
      await api.post(`/cases/${id}/survey/photos?${qp.toString()}`, form)
      setSurveyPhotoFile(null)
      setSurveyPhotoCaption('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to upload survey photo')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSurveyPhoto(photoId) {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/survey/photos/${photoId}`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to delete photo')
    } finally {
      setBusy(false)
    }
  }

  async function createQuote() {
    setBusy(true)
    setError('')
    try {
      const addons = []
      if (addonName.trim() && addonPrice) addons.push({ name: addonName.trim(), price: addonPrice })
      const res = await api.post(`/cases/${id}/quotes`, {
        install_type: installType,
        base_price: basePrice,
        extra_distance_meters: extraMeters,
        extra_distance_rate: extraRate,
        permit_fee: permitFee,
        survey_credit: surveyCredit,
        addons,
      })
      setData((prev) => ({ ...prev, active_quote: res.data }))
      setAddonName('')
      setAddonPrice('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create quote')
    } finally {
      setBusy(false)
    }
  }

  async function sendQuote() {
    const quoteId = data?.active_quote?.id
    if (!quoteId) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/quotes/${quoteId}/send`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to send quote')
    } finally {
      setBusy(false)
    }
  }

  async function previewQuote() {
    const quoteId = data?.active_quote?.id
    if (!quoteId) return
    setBusy(true)
    setError('')
    try {
      const res = await api.get(`/quotes/${quoteId}/preview`)
      const w = window.open('', '_blank')
      if (w) w.document.write(res.data?.html || '<p>No preview</p>')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to preview quote')
    } finally {
      setBusy(false)
    }
  }

  async function savePermit() {
    setBusy(true)
    setError('')
    try {
      const payload = {
        permit_number: permitNumber || null,
        applied_date: permitAppliedDate || null,
        expected_approval_date: permitExpectedDate || null,
        actual_approval_date: permitActualDate || null,
        status: permitStatus,
        notes: permitNotes || null,
      }
      const res = await api.post(`/cases/${id}/permit`, payload)
      setPermit(res.data)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save permit')
    } finally {
      setBusy(false)
    }
  }

  async function uploadPermitAttachment() {
    if (!permit?.id || !permitFile) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', permitFile)
      await api.post(`/permits/${permit.id}/attachments`, form)
      setPermitFile(null)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to upload attachment')
    } finally {
      setBusy(false)
    }
  }

  async function scheduleInstallation() {
    if (!installDt) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/cases/${id}/installation/schedule`, {
        scheduled_date: new Date(installDt).toISOString(),
        notes: installNotes || null,
      })
      setInstallNotes('')
      await load()
      setSuccess('Installation scheduled.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to schedule installation')
    } finally {
      setBusy(false)
    }
  }

  async function rejectInstallationRequest() {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/cases/${id}/installation/request/reject`, { note: installRejectNote.trim() || null })
      setInstallRejectNote('')
      await load()
      setSuccess('Installation request rejected — customer will choose again.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to reject installation request')
    } finally {
      setBusy(false)
    }
  }

  async function completeInstallation() {
    setBusy(true)
    setError('')
    try {
      await api.patch(`/cases/${id}/installation/complete`, { notes: installNotes || null })
      setInstallNotes('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to complete installation')
    } finally {
      setBusy(false)
    }
  }

  async function saveInstallationReport() {
    setBusy(true)
    setError('')
    try {
      const payload = {
        installed_items: installReportInstalledItems || null,
        wire_gauge: installReportWireGauge || null,
        max_charging_amps: installReportMaxAmps === '' ? null : Number(installReportMaxAmps),
        test_passed: !!installReportTestPassed,
        test_notes: installReportTestNotes || null,
      }
      await api.patch(`/cases/${id}/installation/report`, payload)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save installation report')
    } finally {
      setBusy(false)
    }
  }

  async function uploadInstallationPhoto() {
    if (!installPhotoFile) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', installPhotoFile)
      if (installPhotoCaption) form.append('caption', installPhotoCaption)
      await api.post(`/cases/${id}/installation/photos`, form)
      setInstallPhotoCaption('')
      setInstallPhotoFile(null)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to upload installation photo')
    } finally {
      setBusy(false)
    }
  }

  async function deleteInstallationPhoto(photoId) {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/installation/photos/${photoId}`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to delete photo')
    } finally {
      setBusy(false)
    }
  }

  async function sendInstallationReport() {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/cases/${id}/installation/report/send`)
      await load()
      setSuccess('Install report sent.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to send installation report')
    } finally {
      setBusy(false)
    }
  }

  async function sendCompletionEmail() {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/cases/${id}/completion-email`)
      await load()
      setSuccess('Completion email sent. Case marked completed.')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to send completion email')
    } finally {
      setBusy(false)
    }
  }

  async function resendEmail(notificationId) {
    if (!notificationId) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/notifications/${notificationId}/resend`, { to_email: resendEmailTo.trim() || null })
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to resend email')
    } finally {
      setBusy(false)
    }
  }

  async function overrideStatus() {
    if (!overridePassword.trim() || !overrideToStatus) {
      setError('Admin password and target status are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post(`/cases/${id}/override-status`, {
        admin_password: overridePassword,
        to_status: overrideToStatus,
        note: overrideNote || null,
      })
      setOverridePassword('')
      setOverrideNote('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to override status')
    } finally {
      setBusy(false)
    }
  }

  async function addInternalNote() {
    const content = newNote.trim()
    if (!content) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/cases/${id}/notes`, { content })
      setNewNote('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to add note')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <ImageModal open={!!preview} onClose={() => setPreview(null)} src={preview?.src} title={preview?.title} subtitle={preview?.subtitle} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-600">
            <Link className="text-teal-700 hover:underline" to="/admin/cases">
              Cases
            </Link>{' '}
            / {data?.reference_number || id}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{data?.reference_number || 'Case'}</h1>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-slate-600">Loading…</div> : null}
      {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</div> : null}

      {data ? (
        <div className="mt-4 space-y-4">
          <SectionCard tone="slate" title="Customer" subtitle="People & case basics">
            <div className="grid gap-2 text-sm">
              <div>
                <span className="text-slate-500">Nickname:</span>{' '}
                <span className="font-medium text-slate-900">{data.customer.nickname}</span>
              </div>
              <div>
                <span className="text-slate-500">Phone:</span>{' '}
                <span className="font-medium text-slate-900">{data.customer.phone}</span>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>{' '}
                <span className="font-medium text-slate-900">{data.customer.email}</span>
              </div>
              <div>
                <span className="text-slate-500">Address:</span>{' '}
                <span className="font-medium text-slate-900">{data.install_address}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{' '}
                <Pill tone={toneForCaseStatus(data.status)}>{data.status}</Pill>
              </div>
              {tokenLink ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Customer link (dev)</div>
                  <div className="mt-1 break-all text-xs text-slate-700">{tokenLink}</div>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            tone="teal"
            title="Survey"
            subtitle="Step 1 — Schedule & complete site survey (photos unlock after completion)"
          >
            {isAtOrAfter(data.status, 'survey_completed') ? (
              <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                Completed — locked to prevent mistakes.
              </div>
            ) : null}
            {data.survey_request_status === 'pending' && data.survey_requested_date ? (
              <div className="mt-3 rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold">Customer requested survey time</div>
                <div className="mt-1">{new Date(data.survey_requested_date).toLocaleString()}</div>
                {data.survey_request_note ? <div className="mt-1 text-amber-800">Note: {data.survey_request_note}</div> : null}
              </div>
            ) : null}
            {data.survey_request_status === 'rejected' && data.survey_request_admin_note ? (
              <div className="mt-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="font-semibold">Last rejection</div>
                <div className="mt-1">{data.survey_request_admin_note}</div>
              </div>
            ) : null}
            {!data.survey_scheduled_date && !data.survey_requested_date ? (
              <div className="mt-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                Waiting for customer to choose a survey time.
              </div>
            ) : null}
            <div className="mt-2 text-sm text-slate-700">
              Scheduled: {data.survey_scheduled_date ? new Date(data.survey_scheduled_date).toLocaleString() : '—'}
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Deposit:{' '}
              <Pill tone={data.survey_deposit_paid ? 'emerald' : 'slate'}>
                {data.survey_deposit_paid ? 'Paid' : 'Not paid'}
              </Pill>{' '}
              {data.survey_deposit_amount ? <span className="text-slate-500">({money(data.survey_deposit_amount)})</span> : null}
            </div>
            {depositReportedAt ? (
              <div className="mt-1 text-xs text-amber-800">
                Customer reported e-transfer: {new Date(depositReportedAt).toLocaleString()}
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !data.survey_scheduled_date || data.survey_deposit_paid}
              onClick={markDepositPaid}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Mark deposit paid (e-transfer)
            </button>

            <label className="mt-3 block">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Survey notes (internal)</div>
              <textarea
                value={surveyNotes}
                onChange={(e) => setSurveyNotes(e.target.value)}
                disabled={busy || isAtOrAfter(data.status, 'survey_completed')}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                rows={3}
                placeholder="What you found on site…"
              />
            </label>
            <button
              type="button"
              disabled={busy || isAtOrAfter(data.status, 'survey_completed') || !data.survey_scheduled_date}
              onClick={completeSurvey}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              Complete survey (unlock quote)
            </button>
            <label className="mt-3 block">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Schedule (local time)</div>
              <input
                type="datetime-local"
                value={surveyDt}
                onChange={(e) => setSurveyDt(e.target.value)}
                disabled={
                  busy ||
                  isAtOrAfter(data.status, 'survey_completed') ||
                  !(data.survey_request_status === 'pending' && data.survey_requested_date)
                }
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busy ||
                  isAtOrAfter(data.status, 'survey_completed') ||
                  !surveyDt ||
                  !(data.survey_request_status === 'pending' && data.survey_requested_date)
                }
                onClick={scheduleSurvey}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                Confirm requested time
              </button>
              <button
                type="button"
                disabled={busy || !(data.survey_request_status === 'pending' && data.survey_requested_date)}
                onClick={rejectSurveyRequest}
                className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
            {data.survey_request_status === 'pending' && data.survey_requested_date ? (
              <label className="mt-2 block">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Rejection reason (sent to customer)</div>
                <input
                  value={surveyRejectNote}
                  onChange={(e) => setSurveyRejectNote(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-600 disabled:bg-slate-50"
                  placeholder="Optional. If empty, a default message is used."
                />
              </label>
            ) : null}

            <LockedSection locked={!canUploadSurveyPhotos(data.status)} reason="Survey photos unlock after the survey is completed.">
              <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Survey photos</div>
                <div className="mt-2 grid gap-2">
                  <select
                    value={surveyPhotoCategory}
                    onChange={(e) => setSurveyPhotoCategory(e.target.value)}
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="panel_front">panel_front</option>
                    <option value="panel_inside">panel_inside</option>
                    <option value="meter">meter</option>
                    <option value="install_location">install_location</option>
                    <option value="wiring_path">wiring_path</option>
                    <option value="other">other</option>
                  </select>
                  <input
                    value={surveyPhotoCaption}
                    onChange={(e) => setSurveyPhotoCaption(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                    placeholder="caption (optional)"
                  />
                  <input
                    type="file"
                    onChange={(e) => setSurveyPhotoFile(e.target.files?.[0] || null)}
                    className="w-full text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !surveyPhotoFile}
                    onClick={uploadSurveyPhoto}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Upload photo
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {surveyPhotos.map((p) => (
                    <div key={p.id} className="rounded-xl border bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold">{p.category}</span> • {new Date(p.created_at).toLocaleString()}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteSurveyPhoto(p.id)}
                          className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                      {p.caption ? <div className="mt-1 text-xs text-slate-500">{p.caption}</div> : null}
                      <div className="mt-2 overflow-hidden rounded-lg border bg-slate-50">
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              src: `/${p.file_path}`,
                              title: p.file_name || p.category || 'Survey photo',
                              subtitle: p.caption || p.category,
                            })
                          }
                          className="block w-full"
                          title="Click to preview"
                        >
                          <img src={`/${p.file_path}`} alt={p.file_name} className="h-40 w-full object-cover" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {surveyPhotos.length === 0 ? <div className="text-xs text-slate-600">No photos.</div> : null}
                </div>
              </div>
            </LockedSection>
          </SectionCard>

          <div id="quote">
            <LockedSection locked={!canCreateOrEditQuote(data.status)} reason="Quote unlocks after the survey is completed.">
              <SectionCard
                tone="amber"
                title="Quote"
                subtitle="Step 2 — Build & send quote (unlocks after survey completion)"
                right={
                  data.active_quote ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={previewQuote}
                        className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={sendQuote}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        Send active quote
                      </button>
                    </div>
                  ) : null
                }
              >
                {data.active_quote ? (
                  <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">Version</div>
                  <div className="font-semibold text-slate-900">v{data.active_quote.version}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">Total</div>
                  <div className="font-semibold text-slate-900">{money(data.active_quote.total)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-600">Approved</div>
                  <Pill tone={data.active_quote.signature ? 'emerald' : 'slate'}>{data.active_quote.signature ? 'yes' : 'no'}</Pill>
                </div>
                {data.active_quote.signature ? (
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-xs text-slate-500">Signed by</div>
                    <div className="mt-0.5 font-semibold text-slate-900">{data.active_quote.signature.signed_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(data.active_quote.signature.signed_at).toLocaleString()}
                    </div>
                    {String(data.active_quote.signature.signature_data || '').startsWith('data:image') ? (
                      <img
                        alt="Signature"
                        src={data.active_quote.signature.signature_data}
                        className="mt-2 max-h-40 w-full rounded-xl border bg-white object-contain"
                      />
                    ) : null}
                  </div>
                ) : null}
                <div className="text-xs text-slate-500">
                  Sent: {data.active_quote.sent_at ? new Date(data.active_quote.sent_at).toLocaleString() : '—'}
                </div>
              </div>
            ) : (
                  <div className="text-sm text-slate-600">No active quote yet.</div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-6">
              <label className="block md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Install type</div>
                <select
                  value={installType}
                  onChange={(e) => setInstallType(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="surface_mount">surface_mount</option>
                  <option value="concealed">concealed</option>
                </select>
              </label>
              <Field label="Base price" value={basePrice} onChange={setBasePrice} />
              <Field label="Extra meters" value={extraMeters} onChange={setExtraMeters} />
              <Field label="Extra rate" value={extraRate} onChange={setExtraRate} />
              <Field label="Permit fee" value={permitFee} onChange={setPermitFee} />
              <Field label="Survey credit" value={surveyCredit} onChange={setSurveyCredit} />
              <Field label="Addon name" value={addonName} onChange={setAddonName} />
              <Field label="Addon price" value={addonPrice} onChange={setAddonPrice} />
              <div className="md:col-span-6">
                <button
                  type="button"
                  disabled={busy}
                  onClick={createQuote}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Create new quote version
                </button>
              </div>
            </div>
              </SectionCard>
            </LockedSection>
          </div>

          <div id="permit">
            <LockedSection locked={!canEditPermit(data.status)} reason="Permit unlocks after customer approves the quote.">
              <SectionCard tone="indigo" title="Permit" subtitle="Step 3 — Permit tracking (unlocks after customer approves quote)">
              {isAtOrAfter(data.status, 'permit_approved') ? (
                <div className="mb-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Approved — locked to prevent mistakes.
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-6">
              <Field label="Permit number" value={permitNumber} onChange={setPermitNumber} />
              <label className="block md:col-span-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</div>
                <select
                  value={permitStatus}
                  onChange={(e) => setPermitStatus(e.target.value)}
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                >
                  <option value="applied">applied</option>
                  <option value="approved">approved</option>
                  <option value="revision_required">revision_required</option>
                </select>
                <div className="mt-1 text-xs text-slate-500">Change status here, then click “Save permit”.</div>
              </label>
              <label className="block md:col-span-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Applied date</div>
                <input
                  type="date"
                  value={permitAppliedDate || ''}
                  onChange={(e) => setPermitAppliedDate(e.target.value)}
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                />
              </label>
              <label className="block md:col-span-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Expected approval</div>
                <input
                  type="date"
                  value={permitExpectedDate || ''}
                  onChange={(e) => setPermitExpectedDate(e.target.value)}
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                />
              </label>
              <label className="block md:col-span-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Actual approval</div>
                <input
                  type="date"
                  value={permitActualDate || ''}
                  onChange={(e) => setPermitActualDate(e.target.value)}
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                />
              </label>
              <label className="block md:col-span-6">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Notes</div>
                <textarea
                  value={permitNotes}
                  onChange={(e) => setPermitNotes(e.target.value)}
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                  rows={3}
                />
              </label>
              <div className="md:col-span-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                  onClick={savePermit}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Save permit
                </button>
                <div className="text-xs text-slate-500">Current: {permit ? `permit_id=${permit.id}` : 'none'}</div>
              </div>

              <div className="md:col-span-6 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Attachments</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    disabled={busy || isAtOrAfter(data.status, 'permit_approved')}
                    onChange={(e) => setPermitFile(e.target.files?.[0] || null)}
                    className="text-sm disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={busy || isAtOrAfter(data.status, 'permit_approved') || !permitFile || !permit?.id}
                    onClick={uploadPermitAttachment}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Upload
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {(permit?.attachments || []).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                      <div className="min-w-0">
                        <a className="block truncate font-semibold text-teal-700 hover:underline" href={`/${a.file_path}`} target="_blank" rel="noreferrer">
                          {a.file_name}
                        </a>
                        <div className="text-xs text-slate-500">{a.file_path}</div>
                      </div>
                      {isPreviewableImageFileName(a.file_name) ? (
                        <button
                          type="button"
                          className="shrink-0 overflow-hidden rounded-lg border bg-slate-50"
                          title="Preview"
                          onClick={() =>
                            setPreview({
                              src: `/${a.file_path}`,
                              title: a.file_name || 'Attachment',
                              subtitle: 'Permit attachment',
                            })
                          }
                        >
                          <img src={`/${a.file_path}`} alt={a.file_name} className="h-10 w-14 object-cover" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {(permit?.attachments || []).length === 0 ? <div className="text-xs text-slate-600">No attachments.</div> : null}
                </div>
              </div>
              </div>
              </SectionCard>
            </LockedSection>
          </div>

          <div id="installation">
            <LockedSection
              locked={!canEditInstallation(data.status)}
              reason="Installation unlocks after permit is approved."
            >
              <SectionCard tone="emerald" title="Installation" subtitle="Step 4 — Schedule & complete install (unlocks after permit approved)">
              {isAtOrAfter(data.status, 'installed') ? (
                <div className="mb-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Installed — scheduling locked to prevent mistakes. You can still edit the report fields and photos.
                </div>
              ) : null}
              {installation?.request_status === 'pending' && installation?.requested_date ? (
                <div className="mb-3 rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div className="font-semibold">Customer requested installation time</div>
                  <div className="mt-1">{new Date(installation.requested_date).toLocaleString()}</div>
                  {installation?.request_note ? <div className="mt-1 text-amber-800">Note: {installation.request_note}</div> : null}
                </div>
              ) : null}
              {installation?.request_status === 'rejected' && installation?.admin_note ? (
                <div className="mb-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="font-semibold">Last rejection</div>
                  <div className="mt-1">{installation.admin_note}</div>
                </div>
              ) : null}
              {!isAtOrAfter(data.status, 'installed') && !installation?.scheduled_date && !installation?.requested_date ? (
                <div className="mb-3 rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Waiting for customer to choose an installation time.
                </div>
              ) : null}
              {installationDateIssue ? (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  Date issue: completed time is earlier than scheduled time. You can fix the schedule to a time on/before completion.
                </div>
              ) : null}
              <div className="mt-2 grid gap-2 text-sm text-slate-700">
              <div>Scheduled: {installation?.scheduled_date ? new Date(installation.scheduled_date).toLocaleString() : '—'}</div>
              <div>Completed: {installation?.completed_at ? new Date(installation.completed_at).toLocaleString() : '—'}</div>
              <div className="flex items-center justify-between">
                <div>Completion email</div>
                <Pill tone={installation?.completion_email_sent ? 'emerald' : 'amber'}>
                  {installation?.completion_email_sent ? 'sent' : 'pending'}
                </Pill>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Schedule (local)</div>
                <input
                  type="datetime-local"
                  value={installDt}
                  onChange={(e) => setInstallDt(e.target.value)}
                  disabled={
                    busy ||
                    (isAtOrAfter(data.status, 'installed') && !installationDateIssue) ||
                    (!installationDateIssue && !(installation?.request_status === 'pending' && installation?.requested_date))
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Notes</div>
                <input
                  value={installNotes}
                  onChange={(e) => setInstallNotes(e.target.value)}
                  disabled={busy || (isAtOrAfter(data.status, 'installed') && !installationDateIssue)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
                />
              </label>
              {hasPendingInstallRequest ? (
                <div className="md:col-span-3 rounded-xl border bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Pending reschedule request — confirm or reject the customer’s requested time first.
                </div>
              ) : null}
              {installationScheduledInFuture ? (
                <div className="md:col-span-3 rounded-xl border bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Too early to mark installed — scheduled time is in the future. Wait until the scheduled time (or reschedule) before marking installed.
                </div>
              ) : null}
              <div className="md:col-span-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    busy ||
                    (isAtOrAfter(data.status, 'installed') && !installationDateIssue) ||
                    !installDt ||
                    (!installationDateIssue && !(installation?.request_status === 'pending' && installation?.requested_date))
                  }
                  onClick={scheduleInstallation}
                  className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {isAtOrAfter(data.status, 'installed') ? 'Fix schedule' : 'Confirm requested time'}
                </button>
                <button
                  type="button"
                  disabled={busy || !(installation?.request_status === 'pending' && installation?.requested_date)}
                  onClick={rejectInstallationRequest}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy || !canMarkInstalled(data.status) || installationScheduledInFuture || hasPendingInstallRequest}
                  onClick={completeInstallation}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  Mark installed
                </button>
                <button
                  type="button"
                  disabled={busy || data.status !== 'installed'}
                  onClick={sendInstallationReport}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  title="Send a detailed HTML installation & testing report to the customer"
                >
                  Send install report
                </button>
                <button
                  type="button"
                  disabled={busy || (data.status !== 'installed' && data.status !== 'completed')}
                  onClick={sendCompletionEmail}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  Send completion email
                </button>
              </div>
              {installation?.request_status === 'pending' && installation?.requested_date ? (
                <label className="md:col-span-3 block">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Rejection reason (sent to customer)</div>
                  <input
                    value={installRejectNote}
                    onChange={(e) => setInstallRejectNote(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-600 disabled:bg-slate-50"
                    placeholder="Optional. If empty, a default message is used."
                  />
                </label>
              ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-6">
                <label className="block md:col-span-6">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Installed items (report)</div>
                  <textarea
                    value={installReportInstalledItems}
                    onChange={(e) => setInstallReportInstalledItems(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    rows={3}
                    placeholder="What was installed, where, and any notable details…"
                  />
                </label>
                <label className="block md:col-span-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Wire gauge</div>
                  <input
                    value={installReportWireGauge}
                    onChange={(e) => setInstallReportWireGauge(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="e.g. 6 AWG"
                  />
                </label>
                <label className="block md:col-span-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Max charging amps</div>
                  <input
                    value={installReportMaxAmps}
                    onChange={(e) => setInstallReportMaxAmps(e.target.value.replace(/[^\d]/g, ''))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="e.g. 40"
                  />
                </label>
                <label className="block md:col-span-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Test result</div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={installReportTestPassed}
                      onChange={(e) => setInstallReportTestPassed(e.target.checked)}
                    />
                    <span className="text-slate-700">PASS</span>
                  </div>
                </label>
                <label className="block md:col-span-6">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Testing notes</div>
                  <textarea
                    value={installReportTestNotes}
                    onChange={(e) => setInstallReportTestNotes(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    rows={3}
                    placeholder="Testing steps, measurements, any issues resolved…"
                  />
                </label>
                <div className="md:col-span-6">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveInstallationReport}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Save report fields
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Installation photos (report)</div>
                <div className="mt-2 grid gap-2">
                  <input
                    value={installPhotoCaption}
                    onChange={(e) => setInstallPhotoCaption(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="caption (optional)"
                  />
                  <input type="file" onChange={(e) => setInstallPhotoFile(e.target.files?.[0] || null)} className="w-full text-sm" />
                  <button
                    type="button"
                    disabled={busy || !installPhotoFile}
                    onClick={uploadInstallationPhoto}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    Upload photo
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {installPhotos.map((p) => (
                    <div key={p.id} className="rounded-xl border bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold">{p.file_name}</span> • {new Date(p.created_at).toLocaleString()}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteInstallationPhoto(p.id)}
                          className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                      {p.caption ? <div className="mt-1 text-xs text-slate-500">{p.caption}</div> : null}
                      <div className="mt-2 overflow-hidden rounded-lg border bg-slate-50">
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              src: `/${p.file_path}`,
                              title: p.file_name || 'Installation photo',
                              subtitle: p.caption || 'Installation photo',
                            })
                          }
                          className="block w-full"
                          title="Click to preview"
                        >
                          <img src={`/${p.file_path}`} alt={p.file_name} className="h-40 w-full object-cover" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {installPhotos.length === 0 ? <div className="text-xs text-slate-600">No photos.</div> : null}
                </div>
              </div>
              </SectionCard>
            </LockedSection>
          </div>

          <SectionCard tone="slate" title="Timeline" subtitle="History & status changes">
            <div className="space-y-2">
              {timeline.map((t) => (
                <div key={t.id} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</div>
                    <Pill tone={toneForTimelineRow(t)} className="shrink-0">
                      {t.to_status}
                    </Pill>
                  </div>
                  <div className="mt-1 text-slate-800">
                    {(t.from_status || '—') + ' → '}
                    <span className="font-semibold">{t.to_status}</span>
                  </div>
                  {t.note ? <div className="mt-1 text-xs text-slate-500">{t.note}</div> : null}
                </div>
              ))}
              {timeline.length === 0 ? <div className="text-sm text-slate-600">No timeline.</div> : null}
            </div>
          </SectionCard>

          <SectionCard tone="slate" title="Internal notes" subtitle="Team-only notes">
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                placeholder="Add a note…"
              />
              <button
                type="button"
                disabled={busy || !newNote.trim()}
                onClick={addInternalNote}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Add
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                  <div className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</div>
                  <div className="mt-1 text-slate-800">{n.content}</div>
                </div>
              ))}
              {notes.length === 0 ? <div className="text-sm text-slate-600">No notes.</div> : null}
            </div>
          </SectionCard>

          <SectionCard tone="slate" title="Notifications" subtitle="Email/SMS delivery log">
            <div className="overflow-auto">
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
                <label className="block flex-1 min-w-[240px]">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Resend email to (optional)</div>
                  <input
                    value={resendEmailTo}
                    onChange={(e) => setResendEmailTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
                    placeholder="leave blank to resend to original recipient"
                  />
                </label>
                <div className="text-xs text-slate-500">
                  If Gmail drops emails, resend here to another mailbox for verification.
                </div>
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td className="px-3 py-2">{new Date(n.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{n.channel}</td>
                      <td className="px-3 py-2">{n.recipient}</td>
                      <td className="px-3 py-2">{n.template_name}</td>
                      <td className="px-3 py-2">{n.status}</td>
                      <td className="px-3 py-2">
                        {n.channel === 'email' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => resendEmail(n.id)}
                            className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Resend
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{n.error_message || '—'}</td>
                    </tr>
                  ))}
                  {notifications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No notifications.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            tone="rose"
            title="Admin override (password required)"
            subtitle="Global modification for emergency fixes — logs history and notifies customer via SMS"
          >
            <div className="grid gap-3 md:grid-cols-6">
              <label className="block md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Admin password</div>
                <input
                  type="password"
                  value={overridePassword}
                  onChange={(e) => setOverridePassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-600"
                  placeholder="Required"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Set case status to</div>
                <select
                  value={overrideToStatus}
                  onChange={(e) => setOverrideToStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-600"
                >
                  <option value="pending">pending</option>
                  <option value="survey_scheduled">survey_scheduled</option>
                  <option value="survey_completed">survey_completed</option>
                  <option value="quoting">quoting</option>
                  <option value="quoted">quoted</option>
                  <option value="customer_approved">customer_approved</option>
                  <option value="permit_applied">permit_applied</option>
                  <option value="permit_approved">permit_approved</option>
                  <option value="installation_scheduled">installation_scheduled</option>
                  <option value="installed">installed</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
              <label className="block md:col-span-6">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Override note (shown in timeline)</div>
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-600"
                  rows={2}
                  placeholder="Why are you overriding?"
                />
              </label>
              <div className="md:col-span-6">
                <button
                  type="button"
                  disabled={busy || !overridePassword.trim() || !overrideToStatus}
                  onClick={overrideStatus}
                  className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  Apply override
                </button>
                <div className="mt-2 text-xs text-slate-500">
                  This bypasses normal workflow locks. Use only when you need to fix a broken case quickly.
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </AdminShell>
  )
}

function Field({ label, value, onChange }) {
  return (
    <label className="block md:col-span-1">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
      />
    </label>
  )
}

function ImageModal({ open, onClose, src, title, subtitle }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="relative mx-auto flex h-full max-w-5xl items-center justify-center p-4">
        <div className="w-full overflow-hidden rounded-2xl border bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{title || 'Preview'}</div>
              {subtitle ? <div className="truncate text-xs text-slate-600">{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {src ? (
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Open
                </a>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
          <div className="bg-slate-900/5 p-3">
            {src ? (
              <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl border bg-white p-2">
                <img src={src} alt={title || 'Preview'} className="max-h-[70vh] w-auto max-w-full object-contain" />
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">No preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

