import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { computeLoad, connectedAmps } from '../utils/cecLoad.js'

/* ---------- panel slot model (ported from the hi-fi mockup) ---------- */
const TYPES = {
  p1: { slots: 1, kind: 'normal', mk: () => [{ label: '', amp: 15, pole: 1 }] },
  p2: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 30, pole: 2 }] },
  tan: { slots: 1, kind: 'normal', mk: () => [{ label: '', amp: 15, pole: 1 }, { label: '', amp: 15, pole: 1 }] },
  quad: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 15, pole: 1 }, { label: '', amp: 30, pole: 2 }, { label: '', amp: 15, pole: 1 }] },
  ev: { slots: 2, kind: 'ev', mk: () => [{ label: 'EV CHARGER', amp: 30, pole: 2 }] },
  solar: { slots: 2, kind: 'solar', mk: () => [{ label: 'SOLAR PV', amp: 40, pole: 2 }] },
  // feeder = the breaker in the MAIN panel that supplies a subpanel. Auto-placed on add, then draggable to any free double-slot.
  feeder: { slots: 2, kind: 'feeder', mk: () => [{ label: '→ SUB', amp: 60, pole: 2 }] },
}
const SPAN = (t) => TYPES[t].slots
const FEEDER_AMPS = [40, 60, 100, 125]

const PALETTE = [
  { type: 'p1', glyph: 'p1', bars: 1, t: '1-Pole 120V', s: '占 1 槽' },
  { type: 'p2', glyph: 'p2', bars: 2, t: '2-Pole 240V', s: '占 2 槽' },
  { type: 'tan', glyph: 'tan', bars: 2, t: 'Tandem', s: '占 1 槽 · 双 120V' },
  { type: 'quad', glyph: 'quad', bars: 3, t: 'Quad space-saver', s: '占 2 槽 · 120/240/120' },
  { type: 'ev', glyph: 'p2 evg', bars: 2, t: 'EV Charger 30A', s: '蓝 · 占 2 槽 · 240V', border: '#bfdbfe', tc: '#1d4ed8', sc: '#60a5fa' },
  { type: 'solar', glyph: 'p2 solg', bars: 2, t: 'Solar 40A', s: '红 · 占 2 槽 · 240V', border: '#fecaca', tc: '#b91c1c', sc: '#f87171' },
]

const num = (s) => {
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}
const slotNumber = (col, row) => (col === 'L' ? row * 2 + 1 : row * 2 + 2)

function buildSlotList(slots) {
  const n = Math.max(2, slots)
  const per = Math.ceil(n / 2)
  const out = []
  for (let r = 0; r < per; r++) {
    for (const col of ['L', 'R']) {
      const nm = slotNumber(col, r)
      if (nm > n) continue
      out.push({ col, row: r, num: nm })
    }
  }
  return out
}

export default function LoadCalc() {
  const { id } = useParams()

  const [brand, setBrand] = useState('Square D QO')
  const [main, setMain] = useState('100 A')
  const [slots, setSlots] = useState(30)
  const [units, setUnits] = useState([])
  const [subEnabled, setSubEnabled] = useState(false)
  const [subpanels, setSubpanels] = useState([]) // [{ id, name, feederAmp, slots, units }]

  const [area, setArea] = useState('180')
  const [heatType, setHeatType] = useState('gas')   // gas | electric
  const [heat, setHeat] = useState('10')
  const [acOn, setAcOn] = useState(false)
  const [ac, setAc] = useState('3.5')
  const [range, setRange] = useState('12')
  const [whType, setWhType] = useState('gas')       // gas | tankless | tank
  const [whKw, setWhKw] = useState('4.5')
  const [hottubOn, setHottubOn] = useState(false)
  const [hottubKw, setHottubKw] = useState('11.5')
  const [poolOn, setPoolOn] = useState(false)
  const [poolKw, setPoolKw] = useState('0')
  const [other, setOther] = useState('0')

  const [overKey, setOverKey] = useState(null)
  const [flashId, setFlashId] = useState(null)
  const [msg, setMsg] = useState('')
  const uidRef = useRef(1)
  const subSeqRef = useRef(1)

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  /* ---------- persistence ---------- */
  useEffect(() => {
    api.get('/cases/' + id + '/load-calc').then((res) => {
      const v = res.data?.value
      if (!v) return
      if (v.brand != null) setBrand(v.brand)
      if (v.main != null) setMain(v.main)
      if (v.slots != null) setSlots(v.slots)
      if (Array.isArray(v.units)) setUnits(v.units)
      const subs = Array.isArray(v.subpanels) ? v.subpanels : []
      setSubpanels(subs)
      setSubEnabled(v.subEnabled != null ? !!v.subEnabled : subs.length > 0)
      const allUnits = [...(v.units || []), ...subs.flatMap((s) => s.units || [])]
      uidRef.current = allUnits.reduce((m, u) => Math.max(m, u.id || 0), 0) + 1
      subSeqRef.current = subs.reduce((m, s) => Math.max(m, parseInt(String(s.id).replace('sub-', ''), 10) || 0), 0) + 1
      const c = v.calc || {}
      if (c.area != null) setArea(String(c.area))
      if (c.heatType != null) setHeatType(c.heatType)
      if (c.heat != null) setHeat(String(c.heat))
      if (c.acOn != null) setAcOn(!!c.acOn)
      if (c.ac != null) setAc(String(c.ac))
      if (c.range != null) setRange(String(c.range))
      if (c.whType != null) setWhType(c.whType)
      if (c.whKw != null) setWhKw(String(c.whKw))
      if (c.hottubOn != null) setHottubOn(!!c.hottubOn)
      if (c.hottubKw != null) setHottubKw(String(c.hottubKw))
      if (c.poolOn != null) setPoolOn(!!c.poolOn)
      if (c.poolKw != null) setPoolKw(String(c.poolKw))
      if (c.other != null) setOther(String(c.other))
    }).catch(() => {})
  }, [id])

  async function save() {
    const value = { brand, main, slots, units, subEnabled, subpanels, calc: { area, heatType, heat, acOn, ac, range, whType, whKw, hottubOn, hottubKw, poolOn, poolKw, other } }
    try {
      await api.put('/cases/' + id + '/load-calc', { value })
      flash('已保存到 case')
    } catch (e) {
      flash(e?.response?.data?.detail || '保存失败')
    }
  }

  /* ---------- panel accessors (pid = 'main' | sub id) ---------- */
  const getUnits = (pid) => (pid === 'main' ? units : subpanels.find((s) => s.id === pid)?.units || [])
  const getSlots = (pid) => (pid === 'main' ? slots : subpanels.find((s) => s.id === pid)?.slots || 12)
  function setUnitsFor(pid, updater) {
    if (pid === 'main') { setUnits(updater); return }
    setSubpanels((ps) => ps.map((s) => (s.id === pid
      ? { ...s, units: typeof updater === 'function' ? updater(s.units) : updater }
      : s)))
  }

  const slotExists = (pid, col, row) => slotNumber(col, row) <= Math.max(2, getSlots(pid))
  const occupiedAt = (pid, col, row, exceptId) =>
    getUnits(pid).some((u) => u.id !== exceptId && u.col === col && (u.row === row || (SPAN(u.type) === 2 && u.row + 1 === row)))

  function place(pid, type, col, row) {
    if (!TYPES[type]) return
    const s = SPAN(type)
    if (occupiedAt(pid, col, row)) return
    if (s === 2 && (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1))) return
    const nid = uidRef.current++
    setUnitsFor(pid, (p) => [...p, { id: nid, type, col, row, kind: TYPES[type].kind, circuits: TYPES[type].mk() }])
    setFlashId(nid)
    setTimeout(() => setFlashId((cur) => (cur === nid ? null : cur)), 700)
  }

  // ponytail: reuse place()'s fit/overlap checks; same-panel move only (feeder stays on main, sub loads stay in their sub)
  function moveUnit(pid, uid, col, row) {
    const u = getUnits(pid).find((x) => x.id === uid)
    if (!u) return
    if (occupiedAt(pid, col, row, uid)) return
    if (SPAN(u.type) === 2 && (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1, uid))) return
    setUnitsFor(pid, (p) => p.map((x) => (x.id === uid ? { ...x, col, row } : x)))
  }

  function deleteUnit(pid, uid) { setUnitsFor(pid, (p) => p.filter((u) => u.id !== uid)) }

  function editCircuit(pid, uid, i) {
    const u = getUnits(pid).find((x) => x.id === uid)
    if (!u) return
    const c = u.circuits[i]
    const label = window.prompt('这一路是干什么的?(用电器名称)', c.label)
    if (label === null) return
    const amp = window.prompt('容量 (A):', c.amp)
    if (amp === null) return
    const newAmp = parseInt(amp, 10) || c.amp
    setUnitsFor(pid, (p) => p.map((x) => x.id !== uid ? x
      : { ...x, circuits: x.circuits.map((cc, j) => j === i ? { ...cc, label: label.trim(), amp: newAmp } : cc) }))
  }

  function keepFitting(list, n) {
    return list.filter((u) => {
      const top = slotNumber(u.col, u.row)
      if (top > n) return false
      if (SPAN(u.type) === 2 && slotNumber(u.col, u.row + 1) > n) return false
      return true
    })
  }

  function changeSlots(pid, v) {
    const n = Math.max(2, parseInt(v, 10) || 12)
    if (pid === 'main') {
      setSlots(n)
      // ponytail: keep breakers that still fit instead of wiping the panel
      setUnits((p) => keepFitting(p, n))
    } else {
      setSubpanels((ps) => ps.map((s) => (s.id === pid ? { ...s, slots: n, units: keepFitting(s.units, n) } : s)))
    }
  }

  /* ---------- subpanel management (feeder lives in the MAIN panel) ---------- */
  function firstFreeDouble(pid) {
    for (const { col, row } of buildSlotList(getSlots(pid))) {
      if (occupiedAt(pid, col, row)) continue
      if (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1)) continue
      return { col, row }
    }
    return null
  }

  function toggleSub() {
    if (subEnabled) {
      if (subpanels.length && !window.confirm('关闭后会移除已添加的 ' + subpanels.length + ' 个 subpanel（含主面板里的 feeder），确定?')) return
      setUnits((p) => p.filter((u) => u.kind !== 'feeder'))
      setSubpanels([])
      setSubEnabled(false)
    } else {
      setSubEnabled(true)
    }
  }

  function addSubpanel() {
    const spot = firstFreeDouble('main')
    if (!spot) { flash('主面板没有连续 2 槽给 feeder，请先增大主面板槽位'); return }
    const seq = subSeqRef.current++
    const sid = 'sub-' + seq
    const name = 'SUB-' + seq
    const feederAmp = 60
    const feederId = uidRef.current++
    setUnits((p) => [...p, {
      id: feederId, type: 'feeder', col: spot.col, row: spot.row, kind: 'feeder',
      subId: sid, circuits: [{ label: '→ ' + name, amp: feederAmp, pole: 2 }],
    }])
    setSubpanels((ps) => [...ps, { id: sid, name, feederAmp, slots: 12, units: [] }])
  }

  function removeSubpanel(sid) {
    setUnits((p) => p.filter((u) => !(u.kind === 'feeder' && u.subId === sid)))
    setSubpanels((ps) => ps.filter((s) => s.id !== sid))
  }

  function setSubFeeder(sid, amp) {
    setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, feederAmp: amp } : s)))
    setUnits((p) => p.map((u) => (u.kind === 'feeder' && u.subId === sid)
      ? { ...u, circuits: [{ ...u.circuits[0], amp }] } : u))
  }

  /* ---------- CEC 8-200 calc (see utils/cecLoad.js) ---------- */
  const calc = useMemo(() => {
    // EV load is summed across the MAIN panel and EVERY subpanel (all fed by the one service).
    const allUnits = [units, ...subpanels.map((s) => s.units)].flat()
    const evW = allUnits.filter((u) => u.kind === 'ev').reduce((a, u) => a + u.circuits.reduce((b, c) => b + c.amp * 240, 0), 0)
    // (vi) 100%: tankless water heater + hot tub + pool. (viii) 25%: tank water heater + other big loads.
    const wh100 = (whType === 'tankless' ? num(whKw) : 0) + (hottubOn ? num(hottubKw) : 0) + (poolOn ? num(poolKw) : 0)
    const other25 = num(other) + (whType === 'tank' ? num(whKw) : 0)
    const acKw = acOn ? ac : '0'
    const r = computeLoad({ area, heat, ac: acKw, range, wh: wh100, other: other25, heatType, main, evW })
    return { ...r, pct: Math.min(140, (r.amps / r.svc) * 100) }
  }, [area, heat, acOn, ac, range, whType, whKw, hottubOn, hottubKw, poolOn, poolKw, other, main, units, subpanels, heatType])

  const f = (w) => (w / 1000).toFixed(1) + ' kW'
  const over = calc.amps > calc.svc
  const fillCls = over ? 'over' : calc.amps > calc.svc * 0.85 ? 'warn' : ''
  const note = ' 最小 service ' + calc.minSvc + 'A (8-200(1)(b))。'
  const brandTag = (brand.split(' ')[0] || 'PANEL').toUpperCase()

  /* ---------- render one placed breaker ---------- */
  function renderUnit(pid, u) {
    if (u.kind === 'feeder') {
      const c = u.circuits[0]
      return (
        <div className="unit feeder tall" draggable
          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('move', JSON.stringify({ pid, uid: u.id })) }}
          title="拖动可在主面板内换位置；删除请用下方 subpanel 的删除按钮">
          <div className="cstack">
            <div className="crow"><span className="ctog" /><span className="clab">{c.label}</span><span className="camp">{c.amp}A·240V</span></div>
          </div>
        </div>
      )
    }
    const span2 = SPAN(u.type) === 2
    const kindCls = u.kind === 'ev' ? 'ev' : u.kind === 'solar' ? 'solar' : ''
    const cls = `unit ${kindCls}${span2 ? ' tall' : ''}${flashId === u.id ? ' in surge' : ''}`
    return (
      <div className={cls} draggable
        onDragStart={(e) => e.dataTransfer.setData('move', JSON.stringify({ pid, uid: u.id }))}>
        <div className="cstack">
          {u.circuits.map((c, i) => {
            const v240 = c.pole === 2 && u.kind === 'normal'
            return (
              <div key={i} className={`crow${v240 ? ' v240' : ''}`} onClick={(e) => { e.stopPropagation(); editCircuit(pid, u.id, i) }}>
                <span className="ctog" />
                {c.label
                  ? <span className="clab">{c.label}</span>
                  : <span className="clab empty">点此命名</span>}
                <span className="camp">{c.amp}A{c.pole === 2 ? '·240V' : ''}</span>
              </div>
            )
          })}
        </div>
        <button className="del" onClick={(e) => { e.stopPropagation(); deleteUnit(pid, u.id) }}>×</button>
      </div>
    )
  }

  /* ---------- render one panel (main or a subpanel) ---------- */
  function renderPanel(pid, pslots, punits, tag, ttl, mainLine, extraClass) {
    return (
      <div className={`panel ${extraClass || ''}`}>
        <div className="brandtag">{tag}</div>
        <div className="ttl">{ttl}</div>
        <div className="main">{mainLine}</div>
        <div className="bus" />
        <div className="rows">
          {buildSlotList(pslots).map(({ col, row, num: nm }) => {
            const key = pid + '-' + col + '-' + row
            const topUnit = punits.find((u) => u.col === col && u.row === row)
            const occ = occupiedAt(pid, col, row)
            return (
              <div key={key}
                className={`slot ${col}${occ ? ' occ' : ''}${overKey === key ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverKey(key) }}
                onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => {
                  e.preventDefault(); setOverKey(null)
                  const mv = e.dataTransfer.getData('move')
                  if (mv) { const m = JSON.parse(mv); if (m.pid === pid) moveUnit(pid, m.uid, col, row); return }
                  place(pid, e.dataTransfer.getData('t'), col, row)
                }}>
                <span className="num">{nm}</span>
                {topUnit && renderUnit(pid, topUnit)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <AdminShell>
      <style>{CSS}</style>
      <div className="lc">
        <div className="wrap">
          <div className="head">
            <div>
              <h1>Load Calculation <span className="badge">CEC 8-200</span></h1>
              <div className="case">Case #{id} · 实时 CEC 8-200 负荷计算</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {msg && <span className="toast">{msg}</span>}
              <button className="btn" onClick={save}>Save to case</button>
              <button className="btn pri" onClick={() => window.print()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
                Print diagram
              </button>
            </div>
          </div>

          {/* config */}
          <div className="cfg">
            <label>Panel brand<input className="w-brand" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
            <label>Main breaker
              <select className="w-amp" value={main} onChange={(e) => setMain(e.target.value)}>
                <option>60 A</option><option>100 A</option><option>125 A</option><option>200 A</option>
              </select>
            </label>
            <label>Spaces (slots)<input className="w-slot" type="number" value={slots} min="12" max="60" step="2" onChange={(e) => changeSlots('main', e.target.value)} /></label>
            <label>Phase / voltage<input className="w-amp" value="240 V 1Ø" readOnly style={{ background: '#F6F7F6', color: '#9CA3AB' }} /></label>
            <label>Subpanel
              <div className="subtoggle">
                <button className={subEnabled ? 'on' : ''} onClick={toggleSub}>{subEnabled ? '已启用' : '关闭'}</button>
                {subEnabled && <button className="addsub" onClick={addSubpanel}>+ 添加</button>}
              </div>
            </label>
          </div>

          <div className="grid">
            {/* palette */}
            <div className="col">
              <div className="ch">Breakers</div>
              <div className="cs">拖到右侧槽位</div>
              <div className="cb">
                <div className="pal">
                  {PALETTE.map((p) => (
                    <div key={p.type} className="brk" draggable
                      style={p.border ? { borderColor: p.border } : undefined}
                      onDragStart={(e) => e.dataTransfer.setData('t', p.type)}>
                      <div className={`glyph ${p.glyph}`}>{Array.from({ length: p.bars }).map((_, i) => <i key={i} />)}</div>
                      <div className="t" style={p.tc ? { color: p.tc } : undefined}>
                        {p.t}<small style={p.sc ? { color: p.sc } : undefined}>{p.s}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="legend">
                  <div className="row"><span className="sw" style={{ background: 'linear-gradient(145deg,#3A4045,#2B3035)' }} />常规回路</div>
                  <div className="row"><span className="sw" style={{ background: '#2563EB' }} />EV 充电桩(待装 · 30A 2-pole)</div>
                  <div className="row"><span className="sw" style={{ background: '#DC2626' }} />Solar 太阳能</div>
                  {subEnabled && <div className="row"><span className="sw" style={{ background: '#7C3AED' }} />Feeder → Subpanel(馈线)</div>}
                </div>
                <div className="tip">点击已放入的 breaker 可<b>命名 + 设容量</b>。EV 自动按 100% 计入负荷(主面板 + 所有 subpanel 一起算),Solar 不计入需求负荷。{subEnabled ? '加 subpanel 后主面板自动生成一条紫色 feeder,拖 breaker 到 subpanel 里即可。盘内已放的 breaker / feeder 可再<b>拖动换位置</b>(如留 1+3 布局)。' : '需要分面板时,上方打开 Subpanel 开关。'}</div>
              </div>
            </div>

            {/* panel stage(s) */}
            <div className="col">
              <div className="ch">Panels</div>
              <div className="cs">{brand} · {main} · {slots} spaces{subEnabled && subpanels.length ? ` · +${subpanels.length} subpanel` : ''}</div>
              <div className="cb" style={{ padding: 0 }}>
                <div className="stage" id="panelPrint">
                  {renderPanel('main', slots, units, brandTag, 'Load Centre',
                    <><span className="dot" /> MAIN <span className="mono">{calc.svc}A</span></>)}

                  {subEnabled && subpanels.map((sp) => {
                    const camps = connectedAmps(sp.units)
                    const oload = camps > sp.feederAmp
                    return (
                      <div key={sp.id} className="substage">
                        <div className="feedwrap"><span className="feedline" /><span className="feedtag">fed by {sp.feederAmp}A feeder ◄ main</span></div>
                        {renderPanel(sp.id, sp.slots, sp.units, sp.name, 'Sub Panel',
                          <><span className="dot amber" /> {sp.name} <span className="mono">{sp.feederAmp}A</span></>, 'sub')}
                        <div className="subctl">
                          <label>Feeder
                            <select value={sp.feederAmp} onChange={(e) => setSubFeeder(sp.id, parseInt(e.target.value, 10))}>
                              {FEEDER_AMPS.map((a) => <option key={a} value={a}>{a} A</option>)}
                            </select>
                          </label>
                          <label>Slots
                            <input type="number" min="6" max="42" step="2" value={sp.slots} onChange={(e) => changeSlots(sp.id, e.target.value)} />
                          </label>
                          <span className={`oload ${oload ? 'bad' : 'ok'}`}>连接负荷 {camps}A / feeder {sp.feederAmp}A{oload ? ' · 超载!' : ''}</span>
                          <button className="rmsub" onClick={() => removeSubpanel(sp.id)}>删除 subpanel</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* load calc */}
            <div className="col">
              <div className="ch">Service load · CEC 8-200</div>
              <div className="cs">实时计算 · EV 按 100% 无需求系数</div>
              <div className="cb">
                <div className="svc">
                  <div className="srow">
                    <span className="sl">居住面积</span>
                    <span className="sc"><input type="number" value={area} onChange={(e) => setArea(e.target.value)} /><em>m²</em></span>
                  </div>
                  <div className="srow">
                    <span className="sl">供热来源</span>
                    <span className="sc">
                      <select value={heatType} onChange={(e) => setHeatType(e.target.value)}>
                        <option value="gas">燃气</option><option value="electric">电</option>
                      </select>
                    </span>
                  </div>
                  {heatType === 'electric' && (
                    <div className="srow sub">
                      <span className="sl">· 电采暖功率</span>
                      <span className="sc"><input type="number" value={heat} onChange={(e) => setHeat(e.target.value)} /><em>kW</em></span>
                    </div>
                  )}
                  <div className="srow">
                    <span className="sl">空调</span>
                    <span className="sc">
                      <button type="button" className={`tg ${acOn ? 'on' : ''}`} onClick={() => setAcOn((v) => !v)}>{acOn ? '有' : '无'}</button>
                      {acOn && <><input type="number" value={ac} onChange={(e) => setAc(e.target.value)} /><em>kW</em></>}
                    </span>
                  </div>
                  <div className="srow">
                    <span className="sl">电炉<i>燃气灶填 0</i></span>
                    <span className="sc"><input type="number" value={range} onChange={(e) => setRange(e.target.value)} /><em>kW</em></span>
                  </div>
                  <div className="srow">
                    <span className="sl">热水器</span>
                    <span className="sc">
                      <select value={whType} onChange={(e) => setWhType(e.target.value)}>
                        <option value="gas">燃气</option><option value="tankless">即热(100%)</option><option value="tank">罐式储水(25%)</option>
                      </select>
                      {whType !== 'gas' && <><input type="number" value={whKw} onChange={(e) => setWhKw(e.target.value)} /><em>kW</em></>}
                    </span>
                  </div>
                  <div className="srow">
                    <span className="sl">Hot tub</span>
                    <span className="sc">
                      <button type="button" className={`tg ${hottubOn ? 'on' : ''}`} onClick={() => setHottubOn((v) => !v)}>{hottubOn ? '有' : '无'}</button>
                      {hottubOn && <><input type="number" value={hottubKw} onChange={(e) => setHottubKw(e.target.value)} /><em>kW</em></>}
                    </span>
                  </div>
                  <div className="srow">
                    <span className="sl">泳池</span>
                    <span className="sc">
                      <button type="button" className={`tg ${poolOn ? 'on' : ''}`} onClick={() => setPoolOn((v) => !v)}>{poolOn ? '有' : '无'}</button>
                      {poolOn && <><input type="number" value={poolKw} onChange={(e) => setPoolKw(e.target.value)} /><em>kW</em></>}
                    </span>
                  </div>
                  <div className="srow">
                    <span className="sl">其他大电器<i>&gt;1.5kW · 烘干机等</i></span>
                    <span className="sc"><input type="number" value={other} onChange={(e) => setOther(e.target.value)} /><em>kW</em></span>
                  </div>
                </div>
                <div className="kv"><span className="k">基础 · 面积 (i)(ii)</span><span className="v mono">{f(calc.basic)}</span></div>
                <div className="kv"><span className="k">{heatType === 'gas' ? '空调 · 100% (iii/iv · 燃气供热)' : '采暖 62-118 / 空调 · 取大 (iii/iv)'}</span><span className="v mono">{f(calc.heatAC)}</span></div>
                <div className="kv"><span className="k">电炉 (v)</span><span className="v mono">{f(calc.rangeDem)}</span></div>
                <div className="kv"><span className="k">即热热水器 / Hot tub / 泳池 · 100% (vi)</span><span className="v mono">{f(calc.whDem)}</span></div>
                <div className="kv"><span className="k">{num(range) > 0 ? '其它附加 · 25% (viii)' : '其它附加 · 6kW内100%+余25% (viii)'}</span><span className="v mono">{f(calc.otherDem)}</span></div>
                <div className="kv"><span className="k" style={{ color: 'var(--blue)', fontWeight: 700 }}>+ EV 充电桩 (100%{subEnabled && subpanels.length ? ' · 含 subpanel' : ''})</span><span className="v mono" style={{ color: 'var(--blue)' }}>+ {f(calc.evW)}</span></div>
                <div className="kv" style={{ borderTop: '2px solid var(--ink)', marginTop: 4, paddingTop: 10 }}><span className="k" style={{ fontWeight: 700, color: 'var(--ink)' }}>计算总负荷</span><span className="v big mono">{calc.amps.toFixed(0)} A</span></div>

                <div className="gauge">
                  <div className="track"><div className={`fill ${fillCls}`} style={{ width: Math.min(100, calc.pct) + '%' }} /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>
                    <span className="mono">{calc.amps.toFixed(0)} A</span><span className="mono">/ {calc.svc} A service</span>
                  </div>
                </div>
                <div className={`verdict ${over ? 'warn' : 'ok'}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div>
                    {over ? '超出 service 容量,需上 EVEMS 或升级 service。' : '容量充足,可直接加装 EV 充电桩。'}
                    <small>{over
                      ? '缺口 ' + (calc.amps - calc.svc).toFixed(0) + ' A · CEC 8-106(10) 加 EVEMS 可把 EV 限到剩余容量免升级。' + note
                      : '余量 ' + (calc.svc - calc.amps).toFixed(0) + ' A。' + note}</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

/* ===== scoped CSS ported from evquote-load-calc-hifi.html (every selector under .lc) ===== */
const CSS = `
.lc{
  --app:#F6F7F6; --card:#fff; --ink:#15171A; --ink2:#585F66; --ink3:#9CA3AB;
  --line:#ECEEED; --line2:#E3E6E4; --accent:#0E9F6E; --accent-d:#047857; --accent-bg:#ECFDF5;
  --amber:#B45309; --rose:#BE123C; --blue:#2563EB; --blue-bg:#EFF6FF; --red:#DC2626; --red-bg:#FEF2F2;
  --panel:#23272B; --panel-2:#191C1F; --slot:#2E3338; --bus:#0E9F6E;
  --shadow:0 1px 2px rgba(21,23,26,.05); --shadow-lg:0 20px 50px rgba(21,23,26,.10);
  background:var(--app); color:var(--ink); font-family:"Plus Jakarta Sans",system-ui,sans-serif; font-size:14px; -webkit-font-smoothing:antialiased;
}
.lc *{box-sizing:border-box}
.lc .mono{font-family:"Fira Code",monospace;font-variant-numeric:tabular-nums}
.lc svg{display:block}
.lc button,.lc input,.lc select{font-family:inherit}
.lc .wrap{max-width:1280px;margin:0 auto;padding:22px}

.lc .head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.lc .head h1{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0;display:flex;align-items:center;gap:10px}
.lc .head .badge{font-size:11px;font-weight:700;color:var(--accent-d);background:var(--accent-bg);padding:4px 10px;border-radius:999px;border:1px solid #A7F3D0}
.lc .head .case{font-size:13px;color:var(--ink3);font-weight:600;margin-top:3px}
.lc .toast{font-size:12.5px;font-weight:600;color:var(--accent-d);background:var(--accent-bg);border:1px solid #A7F3D0;padding:6px 11px;border-radius:9px}
.lc .btn{display:inline-flex;align-items:center;gap:8px;border-radius:11px;padding:10px 16px;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid var(--line2);background:#fff;color:var(--ink2);transition:.15s}
.lc .btn:hover{background:var(--app);color:var(--ink)}
.lc .btn.pri{background:var(--ink);color:#fff;border-color:var(--ink)}
.lc .btn.pri:hover{background:#000}
.lc .btn svg{width:16px;height:16px}

.lc .cfg{display:flex;flex-wrap:wrap;gap:14px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px;box-shadow:var(--shadow);margin-bottom:18px}
.lc .cfg label{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3)}
.lc .cfg input,.lc .cfg select{border:1px solid var(--line2);border-radius:10px;padding:9px 11px;font-size:14px;font-weight:600;color:var(--ink);outline:none;background:#fff}
.lc .cfg input:focus,.lc .cfg select:focus{border-color:var(--accent)}
.lc .cfg .w-amp{width:120px}.lc .cfg .w-brand{width:180px}.lc .cfg .w-slot{width:110px}
.lc .subtoggle{display:flex;align-items:center;gap:8px}
.lc .subtoggle>button{border:1px solid var(--line2);background:#fff;color:var(--ink2);border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.lc .subtoggle>button.on{border-color:#C4B5FD;background:#F5F3FF;color:#6D28D9}
.lc .subtoggle>button:hover{border-color:#A78BFA}
.lc .subtoggle .addsub{border:1px solid #C4B5FD;background:#EDE9FE;color:#6D28D9}
.lc .subtoggle .addsub:hover{background:#DDD6FE}

.lc .grid{display:grid;grid-template-columns:230px 1fr 320px;gap:18px;align-items:start}
@media(max-width:1100px){.lc .grid{grid-template-columns:1fr}}

.lc .col{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}
.lc .col .ch{padding:15px 18px 0;font-size:13px;font-weight:700}
.lc .col .cs{padding:2px 18px 0;font-size:11.5px;color:var(--ink3);font-weight:500}
.lc .col .cb{padding:14px 18px 18px}

.lc .pal{display:flex;flex-direction:column;gap:11px}
.lc .brk{display:flex;align-items:center;gap:11px;border:1.5px solid var(--line2);border-radius:13px;padding:11px 12px;cursor:grab;background:#fff;transition:.15s;user-select:none}
.lc .brk:hover{border-color:var(--accent);box-shadow:0 6px 16px rgba(14,159,110,.12);transform:translateY(-1px)}
.lc .brk:active{cursor:grabbing}
.lc .brk .glyph{width:34px;height:46px;border-radius:6px;background:linear-gradient(145deg,#33393E,#23272B);position:relative;flex:0 0 auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.lc .brk .glyph i{position:absolute;left:50%;transform:translateX(-50%);width:14px;height:7px;border-radius:2px;background:#0E9F6E;box-shadow:0 0 6px rgba(14,159,110,.6)}
.lc .brk .glyph.p1 i{top:19px}
.lc .brk .glyph.p2 i:nth-child(1){top:11px}.lc .brk .glyph.p2 i:nth-child(2){top:28px;background:#facc15;box-shadow:none}
.lc .brk .glyph.tan i:nth-child(1){top:9px;width:11px}.lc .brk .glyph.tan i:nth-child(2){top:30px;width:11px}
.lc .brk .glyph.quad i:nth-child(1){top:7px;width:10px}.lc .brk .glyph.quad i:nth-child(2){top:18px;width:18px;background:#facc15;box-shadow:none}.lc .brk .glyph.quad i:nth-child(3){top:32px;width:10px}
.lc .brk .t{font-size:12.5px;font-weight:700;line-height:1.25}
.lc .brk .t small{display:block;font-size:10.5px;color:var(--ink3);font-weight:500;margin-top:1px}

.lc .legend{margin-top:16px;display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--ink2);font-weight:600}
.lc .legend .row{display:flex;align-items:center;gap:8px}
.lc .legend .sw{width:13px;height:13px;border-radius:4px}
.lc .tip{margin-top:14px;font-size:11px;color:var(--ink3);line-height:1.5;background:var(--app);border-radius:10px;padding:9px 11px}

.lc .stage{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 14px 26px;background:radial-gradient(120% 80% at 50% 0,#fafafa,transparent)}
.lc .panel{width:392px;border-radius:16px;padding:16px 32px;background:linear-gradient(160deg,#2A2F34,#1B1E21);box-shadow:0 30px 60px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06);position:relative}
.lc .panel.sub{width:360px;background:linear-gradient(160deg,#2b2740,#1c1830);box-shadow:0 20px 44px rgba(50,20,90,.28),inset 0 1px 0 rgba(255,255,255,.06)}
.lc .panel .brandtag{position:absolute;top:12px;right:14px;font-size:10px;font-weight:700;letter-spacing:.08em;color:#6B7178;text-transform:uppercase}
.lc .panel .ttl{color:#C9CFD4;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}
.lc .main{display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(145deg,#3A4045,#2A2F34);border:1px solid #444B51;border-radius:9px;padding:11px;margin-bottom:8px;color:#E7ECEF;font-weight:800;font-size:15px;position:relative;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.lc .main .dot{width:9px;height:9px;border-radius:50%;background:#0E9F6E;box-shadow:0 0 10px #0E9F6E;animation:lc-pulse 1.8s ease-in-out infinite}
.lc .main .dot.amber{background:#a78bfa;box-shadow:0 0 10px #a78bfa}
@keyframes lc-pulse{50%{opacity:.4}}
.lc .bus{position:absolute;top:84px;bottom:16px;left:50%;width:6px;transform:translateX(-50%);border-radius:3px;background:linear-gradient(180deg,#0b3d2e,#0b3d2e);overflow:hidden;z-index:0}
.lc .panel.sub .bus{background:linear-gradient(180deg,#3b2d5e,#3b2d5e)}
.lc .bus::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,#10b981 35%,#6ee7b7 50%,#10b981 65%,transparent);background-size:100% 220%;animation:lc-flow 2.4s linear infinite;opacity:.95}
.lc .panel.sub .bus::after{background:linear-gradient(180deg,transparent,#8b5cf6 35%,#c4b5fd 50%,#8b5cf6 65%,transparent);background-size:100% 220%}
@keyframes lc-flow{from{background-position:0 120%}to{background-position:0 -120%}}
.lc .rows{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:7px 30px}
.lc .slot{height:30px;border-radius:6px;background:linear-gradient(180deg,#23282C,#1C2023);border:1px dashed #3A4045;display:flex;align-items:center;position:relative;transition:.15s}
.lc .slot.L{justify-content:flex-end}.lc .slot.R{justify-content:flex-start}
.lc .slot .num{position:absolute;top:50%;transform:translateY(-50%);font-size:9.5px;color:#7A8088;font-weight:700;font-family:"Fira Code",monospace}
.lc .slot.L .num{left:-23px;text-align:right;width:16px}.lc .slot.R .num{right:-23px;width:16px}
.lc .slot.over{border-color:#10b981;background:#19302a;box-shadow:inset 0 0 0 1px #10b981}
.lc .slot.occ{border-style:solid;border-color:transparent;background:transparent}
.lc .unit{height:30px;border-radius:6px;display:block;padding:0;width:100%;cursor:pointer;position:relative;color:#E7ECEF;font-size:11px;font-weight:700;background:linear-gradient(145deg,#3A4045,#2B3035);border:1px solid #4A5158;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);transition:.15s}
.lc .slot.R .unit{flex-direction:row-reverse;text-align:right}
.lc .unit.tall{height:67px;position:absolute;top:0;left:0;width:100%;z-index:3}
.lc .unit:hover{filter:brightness(1.12)}
.lc .unit .toggle{width:9px;height:16px;border-radius:2px;background:#0E9F6E;box-shadow:0 0 7px rgba(14,159,110,.7);flex:0 0 auto}
.lc .unit .amp{font-size:9px;color:#aeb6bc;font-weight:700}
.lc .unit .lab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:10.5px}
.lc .unit.ev{background:linear-gradient(145deg,#1d4ed8,#1e40af);border-color:#3b82f6}
.lc .unit.ev .toggle{background:#60a5fa;box-shadow:0 0 9px rgba(96,165,250,.9)}
.lc .unit.solar{background:linear-gradient(145deg,#dc2626,#b91c1c);border-color:#ef4444}
.lc .unit.solar .toggle{background:#fca5a5;box-shadow:0 0 9px rgba(248,113,113,.9)}
.lc .unit.feeder{background:linear-gradient(145deg,#7c3aed,#5b21b6);border-color:#8b5cf6;cursor:move}
.lc .unit[draggable="true"]:active{cursor:grabbing}
.lc .unit.feeder .ctog{background:#c4b5fd;box-shadow:0 0 8px rgba(196,181,253,.9);height:20px}
.lc .cstack{display:flex;flex-direction:column;height:100%}
.lc .crow{flex:1;display:flex;align-items:center;gap:6px;padding:0 8px;min-height:0;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;transition:background .12s}
.lc .crow:last-child{border-bottom:none}
.lc .crow:hover{background:rgba(255,255,255,.09)}
.lc .slot.R .crow{flex-direction:row-reverse;text-align:right}
.lc .ctog{width:8px;height:13px;border-radius:2px;background:#10b981;box-shadow:0 0 6px rgba(16,185,129,.6);flex:0 0 auto}
.lc .crow.v240 .ctog{height:20px;background:#fbbf24;box-shadow:0 0 5px rgba(251,191,36,.45)}
.lc .unit.ev .ctog{background:#60a5fa;box-shadow:0 0 8px rgba(96,165,250,.9);height:20px}
.lc .unit.solar .ctog{background:#fca5a5;box-shadow:0 0 8px rgba(248,113,113,.9);height:20px}
.lc .clab{flex:1;font-size:10px;font-weight:700;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc .clab.empty{color:#8B9298;font-weight:600;font-style:italic}
.lc .camp{font-size:8.5px;color:#aeb6bc;font-weight:700;white-space:nowrap}
.lc .del{position:absolute;top:-7px;right:-7px;width:16px;height:16px;border-radius:50%;border:none;background:#DC2626;color:#fff;font-size:12px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);z-index:6}
.lc .unit:hover .del{display:flex}
.lc .slot.L .del{right:auto;left:-7px}
.lc .glyph.evg i{background:#60a5fa !important;box-shadow:0 0 6px rgba(96,165,250,.7) !important}
.lc .glyph.solg i{background:#fca5a5 !important;box-shadow:0 0 6px rgba(248,113,113,.7) !important}
@keyframes lc-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
.lc .unit.in{animation:lc-pop .32s cubic-bezier(.2,1.3,.5,1)}
.lc .surge::before{content:"";position:absolute;inset:-3px;border-radius:8px;border:2px solid #34d399;opacity:0;animation:lc-surge .7s ease-out}
@keyframes lc-surge{0%{opacity:.9;transform:scale(.9)}100%{opacity:0;transform:scale(1.25)}}

.lc .substage{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.lc .feedwrap{display:flex;flex-direction:column;align-items:center;gap:2px}
.lc .feedline{width:2px;height:20px;background:linear-gradient(180deg,#7c3aed,#a78bfa);border-radius:2px}
.lc .feedtag{font-size:10px;font-weight:700;color:#7C3AED;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:999px;padding:2px 9px;letter-spacing:.02em}
.lc .subctl{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:2px;padding:8px 10px;background:#F5F3FF;border:1px solid #E9E3FE;border-radius:12px;width:360px}
.lc .subctl label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#6D28D9;text-transform:uppercase;letter-spacing:.03em}
.lc .subctl select,.lc .subctl input{border:1px solid #DDD6FE;border-radius:8px;padding:5px 8px;font-size:12.5px;font-weight:600;color:var(--ink);background:#fff;width:74px}
.lc .subctl .oload{font-size:11px;font-weight:700;font-family:"Fira Code",monospace;padding:3px 9px;border-radius:999px}
.lc .subctl .oload.ok{color:var(--accent-d);background:var(--accent-bg);border:1px solid #A7F3D0}
.lc .subctl .oload.bad{color:#B45309;background:#FFFBEB;border:1px solid #FDE68A}
.lc .subctl .rmsub{margin-left:auto;border:1px solid #FCA5A5;background:#FEF2F2;color:#B91C1C;border-radius:8px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer}
.lc .subctl .rmsub:hover{background:#FEE2E2}

.lc .kv{display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px dashed var(--line2)}
.lc .kv:last-child{border:none}.lc .kv .k{color:var(--ink2);font-weight:500}.lc .kv .v{font-weight:700}
.lc .calcin{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px}
.lc .calcin label{display:flex;flex-direction:column;gap:4px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3)}
.lc .calcin input,.lc .calcin select{width:100%;min-width:0;border:1px solid var(--line2);border-radius:9px;padding:8px 10px;font-size:13.5px;font-weight:600;outline:none;background:#fff}
.lc .calcin input:focus,.lc .calcin select:focus{border-color:var(--accent)}
.lc .calcin input:disabled{background:#F1F3F2;color:#AEB4BA;cursor:not-allowed}
.lc .hint{font-size:11px;color:var(--ink3);line-height:1.6;background:var(--app);border-radius:10px;padding:9px 11px;margin-bottom:12px}
.lc .hint b{color:var(--ink2)}
.lc .svc{display:flex;flex-direction:column;margin-bottom:14px}
.lc .srow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line2);min-height:40px}
.lc .srow:last-child{border-bottom:none}
.lc .srow.sub{padding:5px 0 5px 14px}
.lc .srow.sub .sl{color:var(--ink3)}
.lc .sl{font-size:12.5px;font-weight:700;color:var(--ink2);display:flex;align-items:baseline;gap:7px;white-space:nowrap}
.lc .sl i{font-size:10px;font-weight:600;color:var(--ink3);font-style:normal}
.lc .sc{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:1;min-width:0}
.lc .sc input{width:74px;text-align:right;border:1px solid var(--line2);border-radius:8px;padding:6px 9px;font-size:13px;font-weight:600;outline:none;font-variant-numeric:tabular-nums}
.lc .sc input:focus{border-color:var(--accent)}
.lc .sc select{border:1px solid var(--line2);border-radius:8px;padding:6px 9px;font-size:12.5px;font-weight:600;outline:none;background:#fff;color:var(--ink)}
.lc .sc select:focus{border-color:var(--accent)}
.lc .sc em{font-size:11px;font-weight:600;color:var(--ink3);font-style:normal;width:24px;text-align:left}
.lc .tg{border:1px solid var(--line2);background:#fff;color:var(--ink3);border-radius:8px;padding:6px 0;width:46px;text-align:center;font-size:12px;font-weight:700;cursor:pointer;transition:.15s;flex:0 0 auto}
.lc .tg.on{border-color:var(--accent);background:var(--accent-bg);color:var(--accent-d)}
.lc .gauge{margin:14px 0 6px}
.lc .gauge .track{height:14px;border-radius:8px;background:#EEF1F0;overflow:hidden;position:relative}
.lc .gauge .fill{height:100%;border-radius:8px;background:linear-gradient(90deg,#10b981,#34d399);transition:width .5s cubic-bezier(.2,.8,.3,1)}
.lc .gauge .fill.warn{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.lc .gauge .fill.over{background:linear-gradient(90deg,#dc2626,#f87171)}
.lc .verdict{margin-top:12px;border-radius:13px;padding:13px 15px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:10px}
.lc .verdict.ok{background:var(--accent-bg);color:var(--accent-d);border:1px solid #A7F3D0}
.lc .verdict.warn{background:#FFFBEB;color:var(--amber);border:1px solid #FDE68A}
.lc .verdict svg{width:20px;height:20px;flex:0 0 auto}
.lc .verdict small{display:block;font-weight:500;font-size:12px;opacity:.85;margin-top:2px}
.lc .big{font-size:26px;font-weight:800;letter-spacing:-.02em}

@media print{
  @page{ size:A4 landscape; margin:10mm; }
  html,body{ background:#fff !important; }
  body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body *{ visibility:hidden !important; }
  #panelPrint, #panelPrint *{ visibility:visible !important; }
  /* row+wrap so the main panel and its subpanels sit side by side, not one-per-page */
  #panelPrint{ position:absolute; left:0; top:0; width:100%; padding:0; background:none; display:flex; flex-direction:row; flex-wrap:wrap; align-items:flex-start; justify-content:center; gap:16px 22px; }
  #panelPrint .substage{ width:auto; gap:4px; }
  /* never split a panel across a page boundary */
  #panelPrint .panel, #panelPrint .substage{ margin:0; box-shadow:none; break-inside:avoid; page-break-inside:avoid; }
  #panelPrint .bus::after{ animation:none; }
  .lc .subctl{ display:none !important; }
  .lc .del{ display:none !important; }
}
`
