import { Fragment } from 'react'

// i18n strings mark bold with **x**; React escapes every segment, so no HTML injection.
export function renderBold(text) { return String(text ?? '').split('**').map((seg, i) => (i % 2 ? <b key={i}>{seg}</b> : <Fragment key={i}>{seg}</Fragment>)) }
