// Tone + label helpers for the v3.0 services (diagnostic / bird-netting / cleaning), mirroring
// the conventions in caseStatus.js / tone.js — single source, no per-page drift.

const SERVICE_BOOKING_STATUS_TONE = {
  submitted: 'slate',
  scheduled: 'teal',
  survey_scheduled: 'teal',
  quoted: 'amber',
  approved: 'emerald',
  in_progress: 'indigo',
  install_scheduled: 'teal',
  completed: 'emerald',
  cancelled: 'rose',
}

const CLEANING_VISIT_STATUS_TONE = {
  pending: 'slate',
  notified: 'teal',
  completed: 'emerald',
  skipped: 'rose',
}

const SERVICE_KIND_TONE = {
  ev: 'indigo',
  diagnostic: 'amber',
  bird_netting: 'teal',
  cleaning: 'emerald',
  other: 'slate',
}

const SERVICE_KIND_LABEL = {
  ev: 'EV',
  diagnostic: 'Diagnostic',
  bird_netting: 'Bird Netting',
  cleaning: 'Cleaning',
  other: 'Other',
}

export function toneForServiceBookingStatus(status) {
  return SERVICE_BOOKING_STATUS_TONE[status] || 'slate'
}

export function toneForCleaningVisitStatus(status) {
  return CLEANING_VISIT_STATUS_TONE[status] || 'slate'
}

export function toneForServiceKind(kind) {
  return SERVICE_KIND_TONE[kind] || 'slate'
}

export function serviceKindLabel(kind) {
  return SERVICE_KIND_LABEL[kind] || kind
}

export function humanizeStatus(status) {
  return String(status || '—')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
