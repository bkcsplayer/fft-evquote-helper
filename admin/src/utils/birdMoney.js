export const money = (v) => { const n = Number(v); return Number.isNaN(n) ? '—' : n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) }

// UI-only estimate for unsaved draft inputs (integer cents, HALF_UP for positives — mirrors
// backend app/utils/money.py). Every number the customer sees comes from the server.
export function estimateBirdQuote(rolls, nests, rollPrice, nestFee) {
  const c = (v) => Math.round(Number(v) * 100)
  const sub = Number(rolls) * c(rollPrice) + Number(nests) * c(nestFee)
  const gst = Math.round((sub * 5) / 100)
  const total = sub + gst
  const deposit = Math.round((total * 30) / 100)
  return { subtotal: sub / 100, gst: gst / 100, total: total / 100, deposit: deposit / 100, balance: (total - deposit) / 100 }
}
