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

