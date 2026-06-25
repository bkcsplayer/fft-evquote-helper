import { Pill } from './Pill.jsx'
import { statusLabel, toneForCaseStatus, toneForPermitStatus } from '../../utils/caseStatus.js'

// Unified status tag. Color always derives from the single source (toneForCaseStatus /
// toneForPermitStatus) and the label from CASE_STATUS_LABELS — no per-page drift.

export function StatusTag({ status, className = '' }) {
  return (
    <Pill tone={toneForCaseStatus(status)} className={className}>
      {statusLabel(status)}
    </Pill>
  )
}

export function PermitStatusTag({ status, className = '' }) {
  const raw = String(status || '—').replace(/_/g, ' ')
  const label = raw.charAt(0).toUpperCase() + raw.slice(1)
  return (
    <Pill tone={toneForPermitStatus(status)} className={className}>
      {label}
    </Pill>
  )
}
