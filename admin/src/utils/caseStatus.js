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

export function toneForCaseStatus(status) {
  const s = String(status || '')
  return CASE_STATUS_TONES[s] || 'slate'
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

