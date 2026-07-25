# STEPS: Load Calculator 第二轮专业审查 — 撤销伪"超载"判定 + CEC 64-112(4)(c)(d) 125% 母线核算 + STANDATA 24-ECB-008 合规文案

> Task tier: **STANDARD** · Skill Manifest: `cmm`, `codebase-memory`, `ponytail-review`(MANDATORY-INFRA), `ui-ux-pro-max`(UI 权威,已咨询并折入) — implementer/tester may invoke ONLY these skills.
> NO-ADVISOR ZONE: executing these approved steps never triggers an advisor consult (economy policy F), except the stuck-escalation condition (policy D).

**Kuo's §8 decisions applied (see DESIGN.md `## Review` for full reasoning):**
- Q1: upstream cascade (PV in a subpanel → does the MAIN panel's own busbar also get numerically checked) stays **text-only, not implemented in code** — same as architect default. PLUS Kuo's own addition: the §3.2.5 hint text now leads with a **load-side backfeed vs. line-side tap** determination (line-side tap consumes zero busbar headroom at any layer and is out of scope entirely) — this is now item ① of the hint, with the architect's original ①②③ renumbered ②③④. The exact finalized 4-item string is in Step 18 below; do not paraphrase it.
- Q2: connected-breaker-total row stays as a neutral info pill (not deleted) — Step 2.
- Q3: no code — SUB-2 circuit wattage review is Kuo's own manual work, not represented in any step.
- Q4: Survey checklist stays out of scope. **No backend/model/migration/admin-form step exists anywhere in this file.**
- Q5: EVEMS verdict sentence (ULC-ORD-3141 / accepted-models-list) is included — Step 19.

**Do NOT build**, even if it looks like a natural extension: a numeric upstream-cascade check on the main panel's busbar when PV lives in a subpanel (Q1, text-only this round); any non-dwelling (120%/commercial) branch in `busbarCheck` (125% dwelling-only, forever, per red line); any automatic inference of PV physical position/wiring topology from slot data (position compliance is fixed text only — red line); any change to `computeLoad`'s signature or body (PV never offsets `calc.amps` — red line, and no step below touches it).

**Step 0 — baseline check (run before Step 1):**
`cd admin && npm run build` → must succeed with the current, unmodified tree. If it fails, stop and report — do not start Step 1 against a broken baseline.

---

## admin/src/utils/cecLoad.js — §3.1 comment rewrite + §3.2.1 new functions

- [ ] **Step 1** — `admin/src/utils/cecLoad.js` — Rewrite the comment above `connectedAmps` to state plainly it is a panel-schedule cross-check, NOT an overload/feeder-adequacy test (CEC judges feeder/busbar adequacy by Section 8 demand load in watts, never by summing branch breaker nameplate ratings).
      Find:
      ```js
      // Connected breaker load of a panel, in amps — sum of every circuit's rating.
      // Used only to flag an oversized subpanel vs its feeder breaker.
      // ponytail: connected-load estimate, not a full 8-200 demand calc; conservative (high). Feeder + solar breakers excluded — solar is a source, not a load, and must never inflate a "connected load" figure.
      export function connectedAmps(units) {
      ```
      Replace with:
      ```js
      // Connected breaker rating total of a panel, in amps — for cross-checking entered breakers against
      // the physical panel schedule only. NOT an overload/feeder-adequacy check: CEC judges feeder and busbar
      // adequacy by Section 8 demand load (watts, with demand factors) — summing branch breaker nameplate
      // ratings is not a valid test, and is routinely far above the feeder rating on any normal panel.
      // ponytail: connected-load estimate; conservative (high). Feeder + solar breakers excluded — solar is a source, not a load, and must never inflate a "connected load" figure.
      export function connectedAmps(units) {
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "NOT an overload/feeder-adequacy check" admin/src/utils/cecLoad.js` → 1 match.

- [ ] **Step 2** — `admin/src/utils/cecLoad.js` — Add `busbarCheck` and `solarAmpsOf`, inserted directly after `connectedAmps`'s closing brace and before the `computeLoad` comment block.
      Find:
      ```js
        return sum + (u.circuits || []).reduce((a, c) => a + (Number(c.amp) || 0), 0)
        }, 0)
      }

      // Full 8-200(1)(a) calculated load. Inputs area in m², heat/ac/range/wh/other in kW,
      ```
      Replace with:
      ```js
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
      ```
      Note: the indentation above is written for readability in this document; match the file's actual 2-space indent when editing (i.e. `return sum + ...` and `}, 0)` are indented one level inside the function, not flush left as shown in the "Find" block's second line — copy the exact surrounding whitespace from the live file, only insert the new block between `connectedAmps`'s closing `}` and the `computeLoad` comment.
      verify: `cd admin && npm run build` → succeeds. `grep -n "export function busbarCheck\|export const solarAmpsOf" admin/src/utils/cecLoad.js` → 2 matches.

## admin/src/pages/LoadCalc.jsx — §3.1 "超载!" judgment removal (one atomic step: leaves no intermediate reference to a deleted `oload`)

- [ ] **Step 3** — `admin/src/pages/LoadCalc.jsx` — Remove the `oload` boolean and replace the amber/red "超载!" pill with a neutral info pill. Both hunks in this one step — doing them separately leaves a `ReferenceError: oload is not defined` at runtime between steps (Rollup/Vite build will NOT catch this — it's a JSX runtime reference, not a static import error).
      Hunk 1 — find:
      ```jsx
                  {subEnabled && subpanels.map((sp) => {
                    const camps = connectedAmps(sp.units)
                    const oload = camps > sp.feederAmp
                    return (
      ```
      Replace with:
      ```jsx
                  {subEnabled && subpanels.map((sp) => {
                    const camps = connectedAmps(sp.units)
                    return (
      ```
      Hunk 2 — find:
      ```jsx
                          <span className={`oload ${oload ? 'bad' : 'ok'}`}>连接负荷 {camps}A / feeder {sp.feederAmp}A{oload ? ' · 超载!' : ''}</span>
      ```
      Replace with:
      ```jsx
                          <span className="oload info">断路器额定合计 {camps}A · 非负荷计算,仅供与实物面板核对</span>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "const oload" admin/src/pages/LoadCalc.jsx` → 0 matches. `grep -n "oload info" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 4** — `admin/src/pages/LoadCalc.jsx` (CSS string) — Replace the two-tone `.oload.ok`/`.oload.bad` rules with a single neutral `.oload.info` rule.
      Find:
      ```css
      .lc .subctl .oload{font-size:11px;font-weight:700;font-family:"Fira Code",monospace;padding:3px 9px;border-radius:999px}
      .lc .subctl .oload.ok{color:var(--accent-d);background:var(--accent-bg);border:1px solid #A7F3D0}
      .lc .subctl .oload.bad{color:#B45309;background:#FFFBEB;border:1px solid #FDE68A}
      ```
      Replace with:
      ```css
      .lc .subctl .oload{font-size:11px;font-weight:700;font-family:"Fira Code",monospace;padding:3px 9px;border-radius:999px}
      .lc .subctl .oload.info{color:var(--ink3);background:var(--app);border:1px solid var(--line2)}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "oload.ok\|oload.bad" admin/src/pages/LoadCalc.jsx` → 0 matches. `grep -n "oload.info" admin/src/pages/LoadCalc.jsx` → 1 match (CSS rule; the JSX className match from Step 3 is a separate string `"oload info"` without the dot, so this grep only counts the CSS selector).

## admin/src/pages/LoadCalc.jsx — §3.2 wiring: import, state, persistence, setters

- [ ] **Step 5** — `admin/src/pages/LoadCalc.jsx` — Import the two new pure functions from `cecLoad.js`.
      Find:
      ```js
      import { computeLoad, connectedAmps } from '../utils/cecLoad.js'
      ```
      Replace with:
      ```js
      import { computeLoad, connectedAmps, busbarCheck, solarAmpsOf } from '../utils/cecLoad.js'
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "busbarCheck, solarAmpsOf" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 6** — `admin/src/pages/LoadCalc.jsx` — Add the top-level `busbar` state (main panel), `null` = follow the main breaker rating.
      Find:
      ```js
        const [brand, setBrand] = useState('Square D QO')
        const [main, setMain] = useState('100 A')
        const [slots, setSlots] = useState(30)
        const [units, setUnits] = useState([])
        const [subEnabled, setSubEnabled] = useState(false)
        const [subpanels, setSubpanels] = useState([]) // [{ id, name, feederAmp, slots, units }]
      ```
      Replace with:
      ```js
        const [brand, setBrand] = useState('Square D QO')
        const [main, setMain] = useState('100 A')
        const [busbar, setBusbar] = useState(null) // null = follow main breaker rating (CEC 64-112 busbar rating, may exceed main OCPD)
        const [slots, setSlots] = useState(30)
        const [units, setUnits] = useState([])
        const [subEnabled, setSubEnabled] = useState(false)
        const [subpanels, setSubpanels] = useState([]) // [{ id, name, feederAmp, slots, units, busbar }]
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "const \[busbar, setBusbar\]" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 7** — `admin/src/pages/LoadCalc.jsx` — Restore `busbar` on load. (Subpanel `busbar` needs no separate line — it flows through automatically as part of the whole `subpanels` array already restored by `setSubpanels(subs)`, same as `feederAmp`/`name`.)
      Find:
      ```js
            if (v.brand != null) setBrand(v.brand)
            if (v.main != null) setMain(v.main)
            if (v.slots != null) setSlots(v.slots)
      ```
      Replace with:
      ```js
            if (v.brand != null) setBrand(v.brand)
            if (v.main != null) setMain(v.main)
            if (v.busbar != null) setBusbar(v.busbar)
            if (v.slots != null) setSlots(v.slots)
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "if (v.busbar != null) setBusbar(v.busbar)" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 8** — `admin/src/pages/LoadCalc.jsx` — Include `busbar` in the saved value object. (Subpanel `busbar` needs no separate handling — it's already part of each subpanel object in the `subpanels` array.)
      Find:
      ```js
          const value = { brand, main, slots, units, subEnabled, subpanels, calc: { area, heatType, heat, acOn, ac, range, whType, whKw, hottubOn, hottubKw, poolOn, poolKw, other } }
      ```
      Replace with:
      ```js
          const value = { brand, main, busbar, slots, units, subEnabled, subpanels, calc: { area, heatType, heat, acOn, ac, range, whType, whKw, hottubOn, hottubKw, poolOn, poolKw, other } }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "brand, main, busbar, slots" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 9** — `admin/src/pages/LoadCalc.jsx` — Add `setSubBusbar(sid, n)`, right after `setSubFeeder`. Mirrors `setSubFeeder`'s pattern but only touches the `subpanels` array (busbar isn't mirrored onto any `units` circuit the way feeder amp is onto the feeder breaker's label).
      Find:
      ```js
        function setSubFeeder(sid, amp) {
          setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, feederAmp: amp } : s)))
          setUnits((p) => p.map((u) => (u.kind === 'feeder' && u.subId === sid)
            ? { ...u, circuits: [{ ...u.circuits[0], amp }] } : u))
        }
      ```
      Replace with:
      ```js
        function setSubFeeder(sid, amp) {
          setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, feederAmp: amp } : s)))
          setUnits((p) => p.map((u) => (u.kind === 'feeder' && u.subId === sid)
            ? { ...u, circuits: [{ ...u.circuits[0], amp }] } : u))
        }

        function setSubBusbar(sid, n) {
          setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, busbar: n } : s)))
        }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "function setSubBusbar" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 10** — `admin/src/pages/LoadCalc.jsx` — Add `mainOcpdA`, `busbarEffMain`, and `anySolar` consts, right after `brandTag`.
      Find:
      ```js
        const brandTag = (brand.split(' ')[0] || 'PANEL').toUpperCase()
      ```
      Replace with:
      ```js
        const brandTag = (brand.split(' ')[0] || 'PANEL').toUpperCase()
        const mainOcpdA = parseInt(main, 10) || 100
        const busbarEffMain = busbar ?? mainOcpdA
        const anySolar = solarAmpsOf(units) > 0 || subpanels.some((s) => solarAmpsOf(s.units) > 0)
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "const busbarEffMain\|const anySolar" admin/src/pages/LoadCalc.jsx` → 2 matches.

## admin/src/pages/LoadCalc.jsx — §3.2.4 render64112 helper (must exist before Steps 13/14 call it)

- [ ] **Step 11** — `admin/src/pages/LoadCalc.jsx` — Add the `render64112` helper right after `renderUnit`'s closing brace, before the `renderPanel` comment.
      Find:
      ```jsx
              <button className="del" onClick={(e) => { e.stopPropagation(); deleteUnit(pid, u.id) }}>×</button>
            </div>
          )
        }

        /* ---------- render one panel (main or a subpanel) ---------- */
        function renderPanel(pid, pslots, punits, tag, ttl, mainLine, extraClass) {
      ```
      Replace with:
      ```jsx
              <button className="del" onClick={(e) => { e.stopPropagation(); deleteUnit(pid, u.id) }}>×</button>
            </div>
          )
        }

        // CEC 64-112(4)(c)&(d) dwelling 125% busbar check for one panel (main or a subpanel).
        // Returns null (renders nothing) when the panel has no solar breaker, or when busbar/mainOcpd data is insufficient — never a guessed verdict.
        function render64112(punits, mainOcpd, busbarEff) {
          const solarA = solarAmpsOf(punits)
          if (solarA === 0) return null
          const chk = busbarCheck({ busbar: busbarEff, mainOcpd, solarA })
          if (!chk) return null
          return (
            <div className={`code64 ${chk.ok ? 'ok' : 'bad'}`}>
              {chk.ok ? '✓' : '✗'} 64-112(4)(c)(d): 主OCPD {mainOcpd}A + PV {solarA}A = {chk.sum}A
              {chk.ok ? ' ≤ ' : ' > '}busbar {busbarEff}A × 125% = {chk.limit}A
              {!chk.ok && <div className="fixpath">超限 · 本盘 PV breaker 上限 {chk.maxPv}A · 出路: line-side tap / 64-112(g) 限流 / 换大 busbar 的盘</div>}
            </div>
          )
        }

        /* ---------- render one panel (main or a subpanel) ---------- */
        function renderPanel(pid, pslots, punits, tag, ttl, mainLine, extraClass) {
      ```
      Note: match the file's actual indentation (top-level functions inside the component are indented 2 spaces, as shown by the surrounding `function renderPanel` line) — the snippet above uses that same indent level for consistency with the rest of this file's conventions.
      verify: `cd admin && npm run build` → succeeds. `grep -n "function render64112" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — §3.2.3 UI inputs (main + subpanel)

- [ ] **Step 12** — `admin/src/pages/LoadCalc.jsx` — Add the main-panel `Busbar (A)` input in `.cfg`, between `Main breaker` and `Spaces (slots)`.
      Find:
      ```jsx
              <label>Main breaker
                <select className="w-amp" value={main} onChange={(e) => setMain(e.target.value)}>
                  <option>60 A</option><option>100 A</option><option>125 A</option><option>200 A</option>
                </select>
              </label>
              <label>Spaces (slots)<input className="w-slot" type="number" value={slots} min="12" max="60" step="2" onChange={(e) => changeSlots('main', e.target.value)} /></label>
      ```
      Replace with:
      ```jsx
              <label>Main breaker
                <select className="w-amp" value={main} onChange={(e) => setMain(e.target.value)}>
                  <option>60 A</option><option>100 A</option><option>125 A</option><option>200 A</option>
                </select>
              </label>
              <label>Busbar (A)
                <input className="w-slot" type="number" min="15" max="800" step="5"
                  placeholder={String(mainOcpdA)}
                  value={busbar ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '') { setBusbar(null); return }
                    const n = parseInt(v, 10)
                    if (Number.isFinite(n) && n > 0) setBusbar(n)
                  }} />
              </label>
              <label>Spaces (slots)<input className="w-slot" type="number" value={slots} min="12" max="60" step="2" onChange={(e) => changeSlots('main', e.target.value)} /></label>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "Busbar (A)" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 13** — `admin/src/pages/LoadCalc.jsx` — Insert the main-panel `render64112` call, right after the main `renderPanel(...)` call inside `.stage`.
      Find:
      ```jsx
                  <div className="stage" id="panelPrint">
                    {renderPanel('main', slots, units, brandTag, 'Load Centre',
                      <><span className="dot" /> MAIN <span className="mono">{calc.svc}A</span></>)}

                    {subEnabled && <datalist id="feederPresets">{FEEDER_AMPS.map((a) => <option key={a} value={a} />)}</datalist>}
      ```
      Replace with:
      ```jsx
                  <div className="stage" id="panelPrint">
                    {renderPanel('main', slots, units, brandTag, 'Load Centre',
                      <><span className="dot" /> MAIN <span className="mono">{calc.svc}A</span></>)}
                    {render64112(units, mainOcpdA, busbarEffMain)}

                    {subEnabled && <datalist id="feederPresets">{FEEDER_AMPS.map((a) => <option key={a} value={a} />)}</datalist>}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "render64112(units, mainOcpdA, busbarEffMain)" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 14** — `admin/src/pages/LoadCalc.jsx` — Insert the subpanel `render64112` call, between the subpanel's `renderPanel(...)` call and the `.subctl` div (NEVER inside `.subctl` — it's `display:none` in print, per DESIGN.md §3.2.4).
      Find:
      ```jsx
                            {' '}<span className="mono">{sp.feederAmp}A</span></>, 'sub')}
                          <div className="subctl">
      ```
      Replace with:
      ```jsx
                            {' '}<span className="mono">{sp.feederAmp}A</span></>, 'sub')}
                          {render64112(sp.units, sp.feederAmp, sp.busbar ?? sp.feederAmp)}
                          <div className="subctl">
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "render64112(sp.units, sp.feederAmp" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 15** — `admin/src/pages/LoadCalc.jsx` — Add the subpanel `Busbar` input in `.subctl`, after `Slots` and before the (now-neutral) `oload` info pill from Step 3.
      Find:
      ```jsx
                            <label>Slots
                              <input type="number" min="6" max="42" step="2" value={sp.slots} onChange={(e) => changeSlots(sp.id, e.target.value)} />
                            </label>
                            <span className="oload info">断路器额定合计 {camps}A · 非负荷计算,仅供与实物面板核对</span>
      ```
      Replace with:
      ```jsx
                            <label>Slots
                              <input type="number" min="6" max="42" step="2" value={sp.slots} onChange={(e) => changeSlots(sp.id, e.target.value)} />
                            </label>
                            <label>Busbar
                              <input type="number" min="15" max="800" step="5" placeholder={String(sp.feederAmp)}
                                value={sp.busbar ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  if (v === '') { setSubBusbar(sp.id, null); return }
                                  const n = parseInt(v, 10)
                                  if (Number.isFinite(n) && n > 0) setSubBusbar(sp.id, n)
                                }} />
                            </label>
                            <span className="oload info">断路器额定合计 {camps}A · 非负荷计算,仅供与实物面板核对</span>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "setSubBusbar(sp.id" admin/src/pages/LoadCalc.jsx` → 2 matches (the `null` branch and the `n` branch).

## admin/src/pages/LoadCalc.jsx — §3.2.4 CSS for `.code64`

- [ ] **Step 16** — `admin/src/pages/LoadCalc.jsx` (CSS string) — Add `.code64` styles, right after the `.subctl .rmsub:hover` rule and before `.kv`.
      Find:
      ```css
      .lc .subctl .rmsub:hover{background:#FEE2E2}

      .lc .kv{display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px dashed var(--line2)}
      ```
      Replace with:
      ```css
      .lc .subctl .rmsub:hover{background:#FEE2E2}

      .lc .code64{width:100%;max-width:400px;margin-top:2px;padding:9px 12px;border-radius:10px;font-size:11.5px;font-weight:700;font-family:"Fira Code",monospace;line-height:1.5}
      .lc .code64.ok{color:var(--accent-d);background:var(--accent-bg);border:1px solid #A7F3D0}
      .lc .code64.bad{color:var(--rose);background:var(--red-bg);border:1px solid #FECACA}
      .lc .code64 .fixpath{margin-top:4px;font-weight:600;font-size:11px;opacity:.9}

      .lc .kv{display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px dashed var(--line2)}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "\.lc \.code64{" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — §3.2.5 hint/tip text (Kuo's Q1 addition lives here)

- [ ] **Step 17** — `admin/src/pages/LoadCalc.jsx` — Rewrite the palette `.tip` text: remove the old "并网母线校验(120% 规则)不在本工具范围" sentence, replace with the new 64-112 pointer.
      Find:
      ```jsx
                  <div className="tip">点击已放入的 breaker 可<b>命名 + 设容量</b>。EV 自动按 100% 计入负荷(主面板 + 所有 subpanel 一起算),Solar 不计入需求负荷。Solar 为发电源,不抵扣 8-200 计算负荷;并网母线校验(120% 规则)不在本工具范围,由电工在图纸阶段确认。{subEnabled ? '加 subpanel 后主面板自动生成一条紫色 feeder,拖 breaker 到 subpanel 里即可。盘内已放的 breaker / feeder 可再<b>拖动换位置</b>(如留 1+3 布局)。' : '需要分面板时,上方打开 Subpanel 开关。'}</div>
      ```
      Replace with:
      ```jsx
                  <div className="tip">点击已放入的 breaker 可<b>命名 + 设容量</b>。EV 自动按 100% 计入负荷(主面板 + 所有 subpanel 一起算),Solar 不计入需求负荷。Solar 为发电源,不抵扣 8-200 计算负荷;盘内放入 Solar breaker 后自动按 64-112(4)(c)(d) 做 125% 母线核算(住宅);busbar 额定请照铭牌填写,不填时按主开关/feeder 额定保守取值。{subEnabled ? '加 subpanel 后主面板自动生成一条紫色 feeder,拖 breaker 到 subpanel 里即可。盘内已放的 breaker / feeder 可再<b>拖动换位置</b>(如留 1+3 布局)。' : '需要分面板时,上方打开 Subpanel 开关。'}</div>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "自动按 64-112(4)(c)(d) 做 125% 母线核算" admin/src/pages/LoadCalc.jsx` → 1 match. `grep -n "并网母线校验(120% 规则)不在本工具范围" admin/src/pages/LoadCalc.jsx` → 0 matches.

- [ ] **Step 18** — `admin/src/pages/LoadCalc.jsx` — Add the conditional 64-112 hint line at the bottom of `.stage`, rendered only when any panel (main or a subpanel) has a solar breaker. **Use this exact 4-item string** (DESIGN.md `## Review`, Q1: Kuo's line-side-tap-vs-load-side-backfeed determination is item ①, front-loaded; the architect's original ①②③ are renumbered ②③④ — do not reorder, do not paraphrase, do not add a 5th bullet).
      Find:
      ```jsx
                    <div className="hint" style={{ width: '100%', textAlign: 'center' }}>计算负荷不低于 CEC 8-200(1)(b) 最小 service 下限(minSvc {calc.minSvc}A)。</div>
                  </div>
                </div>
              </div>
      ```
      Replace with:
      ```jsx
                    <div className="hint" style={{ width: '100%', textAlign: 'center' }}>计算负荷不低于 CEC 8-200(1)(b) 最小 service 下限(minSvc {calc.minSvc}A)。</div>
                    {anySolar && (
                      <div className="hint" style={{ width: '100%', textAlign: 'center' }}>64-112 附带条件(电工现场核实):① 先确认现有 PV 是 load-side backfeed(经断路器接入母线,需按 64-112 核算)还是 line-side tap(计量表前/进线侧接入,不占用任何一层母线余量,不在本核算范围——line-side 接入请勿在图内放置 Solar breaker,以下②-④ 均不适用);② PV breaker 须位于母线远离主进线的一端,且贴永久"不得移位"标签;③ 多电源盘按 14-414 设"断开全部隔离开关方可断电"警示;④ PV 位于 subpanel 时,上游主面板母线是否同样需按 64-112 复核(feeder 视为电源侧 OCPD)由电工判定。</div>
                    )}
                  </div>
                </div>
              </div>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "先确认现有 PV 是 load-side backfeed" admin/src/pages/LoadCalc.jsx` → 1 match. `grep -n "anySolar &&" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — §3.3 EVEMS verdict text

- [ ] **Step 19** — `admin/src/pages/LoadCalc.jsx` — Append the EVEMS certification/accepted-list sentence to the verdict's over-capacity branch small text.
      Find:
      ```jsx
                      <small>{over
                        ? '缺口 ' + (calc.amps - calc.svc).toFixed(0) + ' A · CEC 8-106(10) 加 EVEMS 可把 EV 限到剩余容量免升级。' + note
                        : '余量 ' + (calc.svc - calc.amps).toFixed(0) + ' A。' + note}</small>
      ```
      Replace with:
      ```jsx
                      <small>{over
                        ? '缺口 ' + (calc.amps - calc.svc).toFixed(0) + ' A · CEC 8-106(10) 加 EVEMS 可把 EV 限到剩余容量免升级。EVEMS 设备须 ULC-ORD-3141 认证或在 City of Calgary accepted models list 上(不在名单可邮件 electricaltac@calgary.ca 评审)。' + note
                        : '余量 ' + (calc.svc - calc.amps).toFixed(0) + ' A。' + note}</small>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "ULC-ORD-3141" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/utils/cecLoad.selfcheck.mjs — §3.5 regression assertions

- [ ] **Step 20** — `admin/src/utils/cecLoad.selfcheck.mjs` — Import `busbarCheck` and `solarAmpsOf`.
      Find:
      ```js
      import { basicLoad, heatDemand, rangeDemand, otherDemand, computeLoad, connectedAmps } from './cecLoad.js'
      ```
      Replace with:
      ```js
      import { basicLoad, heatDemand, rangeDemand, otherDemand, computeLoad, connectedAmps, busbarCheck, solarAmpsOf } from './cecLoad.js'
      ```
      verify: `cd admin && node src/utils/cecLoad.selfcheck.mjs` → still prints `cecLoad self-check: all assertions passed` (Step 21 not yet applied, but the import itself must resolve without error once Step 2 has landed). `grep -n "busbarCheck, solarAmpsOf" admin/src/utils/cecLoad.selfcheck.mjs` → 1 match.

- [ ] **Step 21** — `admin/src/utils/cecLoad.selfcheck.mjs` — Add the 64-112 table assertions and the STANDATA EV-dilution assertion, before the final `console.log`. The `busbar:60, mainOcpd:60, solarA:40 → ok:false` case is the FFT-2026-0002 SUB-1 default (busbar unfilled → follows the 60A feeder) — **this is the correct, designed-for behavior, not a bug**; do not "fix" it by changing the assertion or the underlying `busbarCheck` logic (see DESIGN.md §3.2.4 "预期行为声明").
      Find:
      ```js
      assert.equal(connectedAmps(sub1Shape), 85) // loads only: 30+30+25; both 20A solar breakers excluded (was 125 before the fix)

      console.log('cecLoad self-check: all assertions passed')
      ```
      Replace with:
      ```js
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
      ```
      verify: `cd admin && node src/utils/cecLoad.selfcheck.mjs` → prints `cecLoad self-check: all assertions passed`, exit code 0.

---

## Test plan

- **Full self-check**: `cd admin && node src/utils/cecLoad.selfcheck.mjs` → all assertions pass, including the new 64-112 table and STANDATA delta assertions from Step 21.
- **Build**: `cd admin && npm run build` → succeeds with no errors (run once more at the end, after all 21 steps, as the final gate).
- **Lint** (final gate only): `cd admin && npm run lint` → no new errors in `LoadCalc.jsx` / `cecLoad.js` / `cecLoad.selfcheck.mjs` compared to a pre-change baseline run.
- **Manual — §3.1 info pill**: open a case's Load Calc, enable a subpanel with breakers whose ratings sum above the feeder rating. Confirm the pill reads "断路器额定合计 {N}A · 非负荷计算,仅供与实物面板核对" in **neutral grey**, with no "超载!" text and no red/amber coloring anywhere on that pill, regardless of how high the sum is relative to the feeder rating.
- **Manual — §3.2 busbar input, main panel**: leave `Busbar (A)` empty → placeholder shows the main breaker's numeric rating (e.g. "100"). Type `225`, tab away → value persists as `225`; clear the field → reverts to placeholder/follow behavior (not a literal `0`).
- **Manual — §3.2 busbar input, subpanel**: same behavior in a subpanel's `Busbar` field inside `.subctl`, placeholder = that subpanel's current feeder rating.
- **Manual — §3.2.4 64-112 status line, no-solar case**: a panel (main or subpanel) with zero solar breakers shows NO 64-112 row at all — confirm it doesn't render even as an empty/blank line.
- **Manual — §3.2.4 64-112 status line, FFT-2026-0002 SUB-1 default-✗ (EXPECTED BEHAVIOR, do not treat as a bug)**: create a subpanel with feeder 60A and two 20A solar breakers, leave its Busbar field empty. Confirm the 64-112 row shows **✗** with "主OCPD 60A + PV 40A = 100A > busbar 60A × 125% = 75A" and a red `.code64.bad` pill with the `fixpath` line underneath. Then fill Busbar with `100` → row flips to **✓** green, "100+40=140A ≤ 100×1.25=125A" — wait, verify the exact printed numbers match what `busbarCheck({busbar:100, mainOcpd:60, solarA:40})` actually returns (sum=100, limit=125, ok=true) rather than assuming; the point of this check is confirming the default-conservative-then-corrects-with-real-data behavior, not a specific narrative.
- **Manual — §3.2.4 print visibility**: with at least one panel showing a 64-112 row (✓ or ✗), open the browser print preview (`window.print()`). Confirm the 64-112 row IS visible in the print preview for both the main panel and any subpanel (it must NOT disappear the way anything inside `.subctl` does — `.subctl` is `display:none` in print). Also place a PV breaker on the **main** panel specifically, print-preview, and confirm the 64-112 row stays attached to the main panel and is not orphaned onto a separate page by itself — this is the one pagination risk DESIGN.md §6 flags as needing real verification (subpanels are already inside `.substage`'s `break-inside:avoid` box and are not at risk; only the main panel's row sits as a loose sibling in `.stage`). If it does get orphaned, do not silently patch it — report to Kuo/implementer for a follow-up fix (e.g. wrapping the main panel + its 64-112 row in a shared `break-inside:avoid` container), it is out of this round's atomic step scope.
- **Manual — §3.2.5 hint text**: with no solar breakers placed anywhere, confirm the "64-112 附带条件" hint line does NOT appear at all (only the pre-existing "计算负荷不低于 CEC 8-200(1)(b)…" line shows). Place one solar breaker anywhere (main or subpanel) → confirm the second hint line appears, starting with "① 先确认现有 PV 是 load-side backfeed…" and reads all four numbered items in order (① line-side/load-side determination, ② busbar-end placement + permanent label, ③ 14-414 warning label, ④ upstream cascade judgment call) — exact text must match Step 18 verbatim, not a paraphrase.
- **Manual — §3.2.5 tip text**: palette `.tip` text no longer contains "并网母线校验(120% 规则)不在本工具范围"; it now reads "...盘内放入 Solar breaker 后自动按 64-112(4)(c)(d) 做 125% 母线核算(住宅);busbar 额定请照铭牌填写,不填时按主开关/feeder 额定保守取值。"
- **Manual — §3.3 EVEMS text**: push the calculated load over the service capacity (e.g. add a large EV breaker on a small service) → verdict's small text under "超出 service 容量…" includes "EVEMS 设备须 ULC-ORD-3141 认证或在 City of Calgary accepted models list 上(不在名单可邮件 electricaltac@calgary.ca 评审)。" before the "最小 service …" note. Confirm the under-capacity (ok) branch is unchanged (no EVEMS sentence there — it's not relevant when there's no gap to fill with EVEMS).
- **Manual — save/load round-trip**: set a main-panel Busbar value and a subpanel Busbar value, click "Save to case", reload the page. Confirm both values are restored exactly (not reverted to placeholder/follow). Then clear the main Busbar field, save, reload — confirm it comes back empty/following (not a stale old value).
- **Red-line spot checks**:
  - *Electrical correctness — 125% dwelling-only*: `grep -n "1.25" admin/src/utils/cecLoad.js` → exactly 1 match, inside `busbarCheck`, with no conditional/branch around it for a non-dwelling case anywhere in the file.
  - *Electrical correctness — no guessing on insufficient data*: `grep -n "insufficient data" admin/src/utils/cecLoad.js` → 1 match (the `return null` comment in `busbarCheck`); confirm by reading `render64112` in `LoadCalc.jsx` that a `null` `chk` renders nothing, never a fabricated ✓ or ✗.
  - *Electrical correctness — PV never offsets calc.amps*: `grep -n "evW\|computeLoad(" admin/src/pages/LoadCalc.jsx` — confirm `calc` (the `useMemo` computing `computeLoad(...)`) has no `busbar`, `busbarCheck`, or `solarA` argument anywhere in its call or its dependency array; `grep -n "function computeLoad" admin/src/utils/cecLoad.js` → signature unchanged from before this round (no new parameter).
  - *Electrical correctness — position compliance is text-only*: `grep -n "render64112\|busbarCheck" admin/src/pages/LoadCalc.jsx` — confirm every call site only ever renders `chk.ok`/`chk.sum`/`chk.limit`/`chk.maxPv` (numeric verdict), and that the position/label/cascade/line-side-tap content added in Step 18 is a static JSX string with no computed condition beyond `anySolar` (which only gates whether the paragraph shows, not what it says).
  - *Trust-boundary validation*: `grep -n "Number.isFinite(n) && n > 0" admin/src/pages/LoadCalc.jsx` → at least 4 matches (pre-existing feeder/slots guards + the two new busbar guards from Steps 12/15).
  - *Data loss*: `grep -n "window.confirm" admin/src/pages/LoadCalc.jsx` → still present (subpanel-removal confirm, untouched); `save()`'s catch block still calls `flash(...)` on failure (`grep -n "flash(e?.response" admin/src/pages/LoadCalc.jsx` → 1 match, unchanged).
  - *Accessibility*: both new Busbar inputs are inside real `<label>` elements (`grep -n "<label>Busbar" admin/src/pages/LoadCalc.jsx` → 2 matches — main cfg + subctl); the `.code64` row shows `✓`/`✗` glyphs together with full numeric text, never color alone (visually confirm in a black-and-white print preview that ok/bad are still distinguishable by the glyph and text, not just by red/green).
  - *Scope discipline (Q4)*: `grep -rn "busbar\|64-112\|Survey" backend/app/models/models.py backend/app/api/v1/admin/cases.py` → 0 matches for `busbar`/`64-112`, confirming zero backend/model changes landed; the `Survey` model (if matched at all) shows no new fields beyond what existed before this round.
