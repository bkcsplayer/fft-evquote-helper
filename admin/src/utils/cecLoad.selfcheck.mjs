// Runnable self-check for the CEC 8-200 calc: `node src/utils/cecLoad.selfcheck.mjs`
import assert from 'node:assert/strict'
import { basicLoad, heatDemand, rangeDemand, otherDemand, computeLoad, connectedAmps, busbarCheck, solarAmpsOf } from './cecLoad.js'

// (i)(ii) basic load steps
assert.equal(basicLoad(0), 0)
assert.equal(basicLoad(90), 5000)
assert.equal(basicLoad(91), 6000) // partial block rounds up
assert.equal(basicLoad(180), 6000)
assert.equal(basicLoad(200), 7000) // 110 over → 2 blocks

// (iii) 62-118 heating: 100% first 10 kW + 75% remainder
assert.equal(heatDemand(8000), 8000)
assert.equal(heatDemand(10000), 10000)
assert.equal(heatDemand(15000), 13750) // 10000 + 5000*0.75

// (v) range demand
assert.equal(rangeDemand(0), 0)
assert.equal(rangeDemand(12000), 6000)
assert.equal(rangeDemand(16000), 7600) // 6000 + 4000*0.4

// (viii) other loads: with vs without range
assert.equal(otherDemand(5000, true), 1250) // range → 25%
assert.equal(otherDemand(5000, false), 5000) // no range → 100% under 6 kW
assert.equal(otherDemand(10000, false), 7000) // 6000 + 4000*0.25

// gas heat zeroes the electric heating term
const gas = computeLoad({ area: 200, heat: 15, ac: 0, range: 0, wh: 0, other: 0, heatType: 'gas', main: '100 A' })
assert.equal(gas.heatAC, 0)

// electric heat applies the 62-118 factor and beats a small A/C
const elec = computeLoad({ area: 200, heat: 15, ac: 5, range: 0, wh: 0, other: 0, heatType: 'electric', main: '100 A' })
assert.equal(elec.heatAC, 13750)

// worked example from the Calgary reference: gas home, 200 m², 5 kW A/C,
// no range, 5 kW dryer, 48 A EVSE → ~119 A
const ex = computeLoad({ area: 200, heat: 0, ac: 5, range: 0, wh: 0, other: 5, heatType: 'gas', main: '100 A', evW: 48 * 240 })
assert.equal(ex.total, 28520)
assert.equal(Math.round(ex.amps), 119)
assert.equal(ex.minSvc, 100)

// connectedAmps: only load breakers counted — feeder AND solar excluded (solar is a source, not a load)
const mixedUnits = [
  { kind: 'normal', circuits: [{ amp: 15 }, { amp: 20 }] },
  { kind: 'feeder', circuits: [{ amp: 60 }] },
  { kind: 'solar', circuits: [{ amp: 20 }] },
]
assert.equal(connectedAmps(mixedUnits), 35) // 15+20 only; feeder(60) and solar(20) excluded

// SUB-1 production shape: 2x20A solar PV must never inflate the connected-load figure
const sub1Shape = [
  { kind: 'solar', circuits: [{ amp: 20 }] },
  { kind: 'solar', circuits: [{ amp: 20 }] },
  { kind: 'normal', circuits: [{ amp: 30 }] },
  { kind: 'normal', circuits: [{ amp: 30 }] },
  { kind: 'normal', circuits: [{ amp: 25 }] },
]
assert.equal(connectedAmps(sub1Shape), 85) // loads only: 30+30+25; both 20A solar breakers excluded (was 125 before the fix)

// CEC 64-112(4)(c)&(d) dwelling table (authoritative input 2026-07):
// busbar/main → PV max: 100/100→25, 125/100→56.25, 200/200→50, 225/200→81.25
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 0 }).maxPv, 25)
assert.equal(busbarCheck({ busbar: 125, mainOcpd: 100, solarA: 0 }).maxPv, 56.25)
assert.equal(busbarCheck({ busbar: 200, mainOcpd: 200, solarA: 0 }).maxPv, 50)
assert.equal(busbarCheck({ busbar: 225, mainOcpd: 200, solarA: 0 }).maxPv, 81.25)
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 25 }).ok, true)   // exactly at limit
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 30 }).ok, false)
assert.equal(busbarCheck({ busbar: 60, mainOcpd: 60, solarA: 40 }).ok, false)    // FFT-2026-0002 SUB-1, busbar unfilled → follows 60A feeder → conservative fail. EXPECTED, not a bug — see DESIGN.md §3.2.4.
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 60, solarA: 40 }).ok, true)    // same panel with real 100A bus recorded
assert.equal(busbarCheck({ busbar: 0, mainOcpd: 100, solarA: 20 }), null)        // insufficient data → no verdict, never a guess
assert.equal(solarAmpsOf([{ kind: 'solar', circuits: [{ amp: 20 }] }, { kind: 'solar', circuits: [{ amp: 20 }] }, { kind: 'normal', circuits: [{ amp: 40 }] }]), 40)

// STANDATA 24-ECB-008: evW must not be diluted by any demand factor — delta of totals with/without EV === full evW
const noEv = computeLoad({ area: 200, heat: 15, ac: 5, range: 12, wh: 5, other: 6, heatType: 'electric', main: '100 A', evW: 0 })
const withEv = computeLoad({ area: 200, heat: 15, ac: 5, range: 12, wh: 5, other: 6, heatType: 'electric', main: '100 A', evW: 11520 })
assert.equal(withEv.total - noEv.total, 11520)

console.log('cecLoad self-check: all assertions passed')
