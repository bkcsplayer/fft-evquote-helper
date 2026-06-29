export const CASE_STATUS_TONES = {
  pending: 'slate',
  survey_scheduled: 'teal',
  survey_completed: 'teal',
  quoting: 'amber',
  quoted: 'amber',
  customer_approved: 'emerald',
  permit_applied: 'teal',
  permit_approved: 'emerald',
  installation_scheduled: 'teal',
  installed: 'emerald',
  completed: 'emerald',
  cancelled: 'rose',
}

export const CASE_STATUS_ORDER = [
  'pending',
  'survey_scheduled',
  'survey_completed',
  'quoting',
  'quoted',
  'customer_approved',
  'permit_applied',
  'permit_approved',
  'installation_scheduled',
  'installed',
  'completed',
  'cancelled',
]

// Human-readable labels (single source so list/dashboard/timeline never drift).
export const CASE_STATUS_LABELS = {
  pending: 'Pending',
  survey_scheduled: 'Survey scheduled',
  survey_completed: 'Survey completed',
  quoting: 'Quoting',
  quoted: 'Quoted',
  customer_approved: 'Approved',
  permit_applied: 'Permit applied',
  permit_approved: 'Permit approved',
  installation_scheduled: 'Install scheduled',
  installed: 'Installed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function statusLabel(status) {
  const s = String(status || '')
  return CASE_STATUS_LABELS[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—'
}

export function toneForCaseStatus(status) {
  const s = String(status || '')
  return CASE_STATUS_TONES[s] || 'slate'
}

// Permit status -> tone (single source; previously hardcoded inline in Permits.jsx).
export const PERMIT_STATUS_TONES = {
  applied: 'teal',
  approved: 'emerald',
  revision_required: 'amber',
}

export function toneForPermitStatus(status) {
  return PERMIT_STATUS_TONES[String(status || '')] || 'slate'
}

// Turn a status-history row into a human-readable action + tone for the activity timeline.
// Single source replacing the old per-page `toneForActivityRow`.
export function describeActivity(row) {
  const note = String(row?.note || '')
  const to = String(row?.to_status || '')
  const lowerNote = note.toLowerCase()

  if (lowerNote.includes('reported e-transfer')) {
    return { label: 'Customer reported e-transfer', tone: 'amber' }
  }
  if (lowerNote.includes('requested survey')) {
    return { label: 'Customer requested a survey time', tone: 'amber' }
  }
  if (lowerNote.includes('requested installation')) {
    return { label: 'Customer requested an install time', tone: 'amber' }
  }
  if (lowerNote.includes('deposit')) {
    return { label: 'Deposit marked paid', tone: 'emerald' }
  }
  if (lowerNote.includes('completion email')) {
    return { label: 'Completion email sent', tone: 'emerald' }
  }
  if (to === 'customer_approved') {
    return { label: 'Customer approved & signed the quote', tone: 'emerald' }
  }
  if (to === 'cancelled') {
    return { label: 'Case cancelled', tone: 'rose' }
  }
  // Default: a status transition to its label, tone from the destination status.
  return { label: `Moved to ${statusLabel(to)}`, tone: toneForCaseStatus(to) }
}

export function isAtOrAfter(status, target) {
  const s = String(status || '')
  const t = String(target || '')
  const si = CASE_STATUS_ORDER.indexOf(s)
  const ti = CASE_STATUS_ORDER.indexOf(t)
  if (ti < 0) return false
  if (si < 0) return false
  return si >= ti
}

export function isCaseStatusIn(status, list) {
  const s = String(status || '')
  return Array.isArray(list) && list.includes(s)
}

// Workflow locks (strict on purpose to prevent inconsistent operations)
export function canEditPermit(caseStatus) {
  return isCaseStatusIn(caseStatus, [
    'customer_approved',
    'permit_applied',
    'permit_approved',
    'installation_scheduled',
    'installed',
    'completed',
  ])
}

export function canEditInstallation(caseStatus) {
  return isCaseStatusIn(caseStatus, [
    'permit_approved',
    'installation_scheduled',
    'installed',
    'completed',
  ])
}

export function canMarkInstalled(caseStatus) {
  return isCaseStatusIn(caseStatus, ['installation_scheduled'])
}

export function canUploadSurveyPhotos(caseStatus) {
  return isCaseStatusIn(caseStatus, [
    'survey_completed',
    'quoting',
    'quoted',
    'customer_approved',
    // Once permit work starts, survey should be read-only to avoid confusion.
  ])
}

export function canCreateOrEditQuote(caseStatus) {
  return isCaseStatusIn(caseStatus, ['survey_completed', 'quoting', 'quoted'])
}

// ── Visual pipeline: collapse the 13 statuses into 6 stages for the case header ──
export const CASE_STAGES = [
  { key: 'lead', label: 'Lead', statuses: ['pending'] },
  { key: 'survey', label: 'Survey', statuses: ['survey_scheduled', 'survey_completed'] },
  { key: 'quote', label: 'Quote', statuses: ['quoting', 'quoted', 'customer_approved'] },
  { key: 'permit', label: 'Permit', statuses: ['permit_applied', 'permit_approved'] },
  { key: 'install', label: 'Install', statuses: ['installation_scheduled', 'installed'] },
  { key: 'complete', label: 'Complete', statuses: ['completed'] },
]

export const DEAD_STATUSES = ['cancelled', 'lost']

// Per-stage state for the stepper: 'done' | 'current' | 'upcoming'.
export function stageStates(status) {
  const s = String(status || '')
  const dead = DEAD_STATUSES.includes(s)
  const curIdx = CASE_STATUS_ORDER.indexOf(s)
  return CASE_STAGES.map((stage) => {
    const idxs = stage.statuses.map((x) => CASE_STATUS_ORDER.indexOf(x)).filter((i) => i >= 0)
    const last = Math.max(...idxs)
    const first = Math.min(...idxs)
    let state = 'upcoming'
    if (!dead && curIdx >= 0) {
      if (curIdx > last) state = 'done'
      else if (curIdx >= first) state = 'current'
    } else if (s === 'completed') {
      state = 'done'
    }
    return { key: stage.key, label: stage.label, state }
  })
}

// The single recommended next action. data = CaseDetailOut; installation = separately-fetched install row.
export function nextAction(data, installation) {
  if (!data) return null
  const s = String(data.status || '')
  if (s === 'completed') return { done: true, label: 'Project completed' }
  if (s === 'cancelled') return { dead: true, label: 'Case cancelled' }
  if (s === 'lost') return { dead: true, label: 'Case lost' }
  // Handshake requests take priority — a customer proposed a time and is waiting on you.
  if (data.survey_request_status === 'pending') return { label: 'Confirm requested survey time', tab: 'survey' }
  if (installation?.request_status === 'pending') return { label: 'Confirm requested install time', tab: 'install' }
  switch (s) {
    case 'pending': return { label: 'Waiting for customer to pick a survey time', tab: 'survey', wait: true }
    case 'survey_scheduled': return { label: 'Mark survey complete', tab: 'survey' }
    case 'survey_completed': return { label: 'Create & send the quote', tab: 'quote' }
    case 'quoting': return { label: 'Send quote to customer', tab: 'quote' }
    case 'quoted': return { label: 'Waiting for customer to approve & sign', tab: 'quote', wait: true }
    case 'customer_approved': return { label: 'Apply for permit', tab: 'permit' }
    case 'permit_applied': return { label: 'Mark permit approved', tab: 'permit' }
    case 'permit_approved': return { label: 'Schedule installation', tab: 'install' }
    case 'installation_scheduled': return { label: 'Mark installation complete', tab: 'install' }
    case 'installed': return { label: 'Send completion email & finish', tab: 'install' }
    default: return { label: 'Review case', tab: 'overview' }
  }
}

// Who the case is waiting on right now. { who, tone }
export function ballInCourt(data, installation) {
  if (!data) return { who: '—', tone: 'slate' }
  const s = String(data.status || '')
  if (s === 'completed') return { who: 'Done', tone: 'emerald' }
  if (DEAD_STATUSES.includes(s)) return { who: '—', tone: 'rose' }
  if (data.survey_request_status === 'pending' || installation?.request_status === 'pending') return { who: 'You', tone: 'amber' }
  if (s === 'pending' || s === 'quoted' || s === 'permit_approved') return { who: 'Customer', tone: 'sky' }
  if (s === 'permit_applied') return { who: 'Permit office', tone: 'amber' }
  return { who: 'You', tone: 'amber' }
}

