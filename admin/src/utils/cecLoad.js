// CEC Rule 8-200(1)(a) — single-dwelling calculated load (Calgary / Alberta).
// Verified 2026-07 against the City of Calgary residential load-calc worksheet.
// All values in watts; divide the total by 240 V to get service amps.

const kw = (n) => (Number.isFinite(n) ? n : 0) * 1000

// (i)(ii) basic load: 5000 W for the first 90 m², +1000 W per additional 90 m²
// (round any partial block up).
export function basicLoad(areaM2) {
  if (!(areaM2 > 0)) return 0
  return 5000 + Math.max(0, Math.ceil((areaM2 - 90) / 90)) * 1000
}

// (iii) electric space heating, Rule 62-118 demand factor:
// 100% of the first 10 kW + 75% of the remainder. Gas heat → caller passes 0.
export function heatDemand(heatW) {
  return heatW <= 10000 ? heatW : 10000 + (heatW - 10000) * 0.75
}

// (v) single electric range: 6000 W, +40% of the nameplate above 12 kW.
// Gas range → 0.
export function rangeDemand(rangeW) {
  if (rangeW <= 0) return 0
  return rangeW <= 12000 ? 6000 : 6000 + (rangeW - 12000) * 0.4
}

// (viii) other loads > 1500 W (storage water heater, dryer, …):
// electric range present → 25% of the load;
// no electric range → 100% of the first 6000 W + 25% of the remainder.
export function otherDemand(otherW, hasRange) {
  if (otherW <= 0) return 0
  if (hasRange) return otherW * 0.25
  return otherW <= 6000 ? otherW : 6000 + (otherW - 6000) * 0.25
}

// Connected breaker rating total of a panel, in amps — for cross-checking entered breakers against
// the physical panel schedule only. NOT an overload/feeder-adequacy check: CEC judges feeder and busbar
// adequacy by Section 8 demand load (watts, with demand factors) — summing branch breaker nameplate
// ratings is not a valid test, and is routinely far above the feeder rating on any normal panel.
// ponytail: connected-load estimate; conservative (high). Feeder + solar breakers excluded — solar is a source, not a load, and must never inflate a "connected load" figure.
export function connectedAmps(units) {
  return (units || []).reduce((sum, u) => {
    if (u.kind === 'feeder' || u.kind === 'solar') return sum
    return sum + (u.circuits || []).reduce((a, c) => a + (Number(c.amp) || 0), 0)
  }, 0)
}

// CEC 64-112(4)(c)&(d) — dwelling: Σ(supply-side OCPD ratings feeding the busbar) ≤ busbar × 1.25.
// mainOcpd = the panel's own supply breaker (main breaker, or feeder rating for a subpanel).
export function busbarCheck({ busbar, mainOcpd, solarA }) {
  if (!(busbar > 0) || !(mainOcpd > 0)) return null // insufficient data → no verdict
  const limit = busbar * 1.25
  const sum = mainOcpd + solarA
  return { sum, limit, maxPv: Math.max(0, limit - mainOcpd), ok: sum <= limit }
}

// Total PV backfeed breaker rating physically in one panel (0 when no solar).
export const solarAmpsOf = (units) => (units || [])
  .filter((u) => u.kind === 'solar')
  .reduce((a, u) => a + (u.circuits || []).reduce((b, c) => b + (Number(c.amp) || 0), 0), 0)

// Full 8-200(1)(a) calculated load. Inputs area in m², heat/ac/range/wh/other in kW,
// heatType 'electric'|'gas', main service size (A), evW already summed in watts.
export function computeLoad({ area, heat, ac, range, wh, other, heatType, main, evW = 0 }) {
  const areaV = Number(area) || 0
  const heatW = heatType === 'gas' ? 0 : kw(Number(heat)) // (iii) gas → no electric heat load
  const acW = kw(Number(ac))
  const rangeW = kw(Number(range))
  const whW = kw(Number(wh))
  const otherW = kw(Number(other))
  const svc = parseInt(main, 10) || 100

  const basic = basicLoad(areaV)
  // 8-106(4): space heating and A/C are seasonally non-coincident → the greater of the two.
  const heatAC = Math.max(heatDemand(heatW), acW)
  const rangeDem = rangeDemand(rangeW)
  const whDem = whW // (vi) tankless / pool / hot-tub / spa @ 100%
  const otherDem = otherDemand(otherW, rangeW > 0) // (viii)
  const total = basic + heatAC + rangeDem + whDem + otherDem + evW // (vii) EVSE @ 100%
  const amps = total / 240
  const minSvc = areaV >= 80 ? 100 : 60 // 8-200(1)(b)
  return { basic, heatAC, rangeDem, whDem, otherDem, evW, total, amps, svc, minSvc }
}
