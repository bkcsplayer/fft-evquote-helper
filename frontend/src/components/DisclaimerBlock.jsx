import { useI18n } from '../i18n/index.js'

/** Full-text disclaimer, scrollable, with an "I agree" checkbox. Records acceptance via onChange. */
export function DisclaimerBlock({ text, accepted, onChange }) {
  const { t } = useI18n()
  return (
    <div className="mt-3">
      <div className="text-sm font-semibold text-slate-900">{t('svc.common.disclaimer_title')}</div>
      <div className="mt-1.5 max-h-40 overflow-y-auto rounded-xl border bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        {text.split('\n\n').map((para, i) => (
          <p key={i} className={i > 0 ? 'mt-2' : ''}>{para}</p>
        ))}
      </div>
      <label className="mt-2 flex items-start gap-2 rounded-xl border p-3 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange?.(e.target.checked)}
          className="mt-1 h-4 w-4 accent-emerald-700"
        />
        <span>{t('svc.common.disclaimer_agree')}</span>
      </label>
    </div>
  )
}
