// Per-service-line glyphs so the 4 service lines are distinguishable by shape, not just color —
// same 24x24 / stroke-1.5 convention as the sidebar icons in AdminShell.jsx.

function IconBolt({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

function IconMagnifyingGlass({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  )
}

function IconNet({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path strokeLinecap="round" d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16" />
    </svg>
  )
}

function IconSparkles({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  )
}

const SERVICE_ICON = {
  ev: IconBolt,
  diagnostic: IconMagnifyingGlass,
  bird_netting: IconNet,
  cleaning: IconSparkles,
}

export function ServiceIcon({ kind, className = 'h-3.5 w-3.5 shrink-0' }) {
  const Icon = SERVICE_ICON[kind]
  if (!Icon) return null
  return <Icon className={className} />
}
