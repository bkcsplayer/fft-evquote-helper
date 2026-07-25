# STEPS: Load Calculator 五项 UI 修复 + CEC 8-200 算法审查 + Solar PV 修正

> Task tier: **STANDARD** · Skill Manifest: `cmm`, `codebase-memory`, `ponytail-review`(MANDATORY-INFRA), `ui-ux-pro-max`(UI 权威,已咨询并折入) — implementer/tester may invoke ONLY these skills.
> NO-ADVISOR ZONE: executing these approved steps never triggers an advisor consult (economy policy F), except the stuck-escalation condition (policy D).

**Kuo's overrides applied (differ from DESIGN.md §3 draft / architect default — see DESIGN.md `## Review`):**
- p2_120 = single 120V circuit (`pole:1`) physically occupying 2 slots — NOT a handle-tied 2-pole/MWBC pair.
- quad4 = single old-style large-frame 2-pole breaker (`pole:2`, one circuit) occupying 4 slots — NOT two stacked 2-pole breakers.
- Subpanel rename = inline `<input>` edit-in-place (click name → edit → blur/Enter commits, Esc cancels) — NOT `window.prompt`.
- CEC 8-200 algorithm itself: **no code change** (DESIGN.md §6.1 verified correct, high confidence) — only the two Q7 UI hints are added.
- 120% busbar rule (Q5) and PV-feedback-vs-feeder warning (Q6): **not implemented**, per Kuo confirmation. Do not add any busbar-rating input or new warning logic.

**Step 0 — baseline check (run before Step 1):**
`cd admin && npm run build` → must succeed with the current, unmodified tree. If it fails, stop and report — do not start Step 1 against a broken baseline.

---

## admin/src/pages/LoadCalc.jsx — placement engine (do these before touching TYPES/PALETTE; a 4-slot type against the old span-2-only engine produces real overlap bugs)

- [ ] **Step 1** — `admin/src/pages/LoadCalc.jsx` — Generalize `occupiedAt` from a hardcoded span-2 check to an arbitrary-span range check.
      Find:
      ```js
      const occupiedAt = (pid, col, row, exceptId) =>
        getUnits(pid).some((u) => u.id !== exceptId && u.col === col && (u.row === row || (SPAN(u.type) === 2 && u.row + 1 === row)))
      ```
      Replace with:
      ```js
      const occupiedAt = (pid, col, row, exceptId) =>
        getUnits(pid).some((u) => u.id !== exceptId && u.col === col && row >= u.row && row < u.row + SPAN(u.type))
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "row < u.row + SPAN" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 2** — `admin/src/pages/LoadCalc.jsx` — Add the `fitsAt()` helper directly below `occupiedAt`.
      Insert immediately after the `occupiedAt` line from Step 1 (before `function place(pid, type, col, row) {`):
      ```js

      // unified placement legality: every slot in the span must exist and be free
      function fitsAt(pid, type, col, row, exceptId) {
        const s = SPAN(type)
        for (let k = 0; k < s; k++) {
          if (!slotExists(pid, col, row + k) || occupiedAt(pid, col, row + k, exceptId)) return false
        }
        return true
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "function fitsAt" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 3** — `admin/src/pages/LoadCalc.jsx` — `place()`: replace the manual span-2 checks with `fitsAt()`.
      Find:
      ```js
      function place(pid, type, col, row) {
        if (!TYPES[type]) return
        const s = SPAN(type)
        if (occupiedAt(pid, col, row)) return
        if (s === 2 && (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1))) return
        const nid = uidRef.current++
      ```
      Replace with:
      ```js
      function place(pid, type, col, row) {
        if (!TYPES[type]) return
        if (!fitsAt(pid, type, col, row)) return
        const nid = uidRef.current++
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "if (!fitsAt(pid, type, col, row)) return" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 4** — `admin/src/pages/LoadCalc.jsx` — `moveUnit()`: replace the manual span-2 checks with `fitsAt()`.
      Find:
      ```js
      function moveUnit(pid, uid, col, row) {
        const u = getUnits(pid).find((x) => x.id === uid)
        if (!u) return
        if (occupiedAt(pid, col, row, uid)) return
        if (SPAN(u.type) === 2 && (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1, uid))) return
        setUnitsFor(pid, (p) => p.map((x) => (x.id === uid ? { ...x, col, row } : x)))
      }
      ```
      Replace with:
      ```js
      function moveUnit(pid, uid, col, row) {
        const u = getUnits(pid).find((x) => x.id === uid)
        if (!u) return
        if (!fitsAt(pid, u.type, col, row, uid)) return
        setUnitsFor(pid, (p) => p.map((x) => (x.id === uid ? { ...x, col, row } : x)))
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "fitsAt(pid, u.type, col, row, uid)" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 5** — `admin/src/pages/LoadCalc.jsx` — `keepFitting()`: generalize the bottom-of-panel bound check to arbitrary span.
      Find:
      ```js
      function keepFitting(list, n) {
        return list.filter((u) => {
          const top = slotNumber(u.col, u.row)
          if (top > n) return false
          if (SPAN(u.type) === 2 && slotNumber(u.col, u.row + 1) > n) return false
          return true
        })
      }
      ```
      Replace with:
      ```js
      function keepFitting(list, n) {
        return list.filter((u) => {
          const top = slotNumber(u.col, u.row)
          if (top > n) return false
          if (slotNumber(u.col, u.row + SPAN(u.type) - 1) > n) return false
          return true
        })
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "u.row + SPAN(u.type) - 1" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 6** — `admin/src/pages/LoadCalc.jsx` — `firstFreeDouble()`: reimplement using `fitsAt()` (semantics unchanged, still only used for the 2-slot feeder).
      Find:
      ```js
      function firstFreeDouble(pid) {
        for (const { col, row } of buildSlotList(getSlots(pid))) {
          if (occupiedAt(pid, col, row)) continue
          if (!slotExists(pid, col, row + 1) || occupiedAt(pid, col, row + 1)) continue
          return { col, row }
        }
        return null
      }
      ```
      Replace with:
      ```js
      function firstFreeDouble(pid) {
        for (const { col, row } of buildSlotList(getSlots(pid))) {
          if (fitsAt(pid, 'feeder', col, row)) return { col, row }
        }
        return null
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "fitsAt(pid, 'feeder', col, row)" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 7** — `admin/src/pages/LoadCalc.jsx` — `renderUnit()`: generalize the `span2`/`tall` class + fixed 67px height to any span, via inline height style (slot height 30 + row gap 7).
      Find (inside `renderUnit`, the non-feeder branch):
      ```js
        const span2 = SPAN(u.type) === 2
        const kindCls = u.kind === 'ev' ? 'ev' : u.kind === 'solar' ? 'solar' : ''
        const cls = `unit ${kindCls}${span2 ? ' tall' : ''}${flashId === u.id ? ' in surge' : ''}`
        return (
          <div className={cls} draggable
            onDragStart={(e) => e.dataTransfer.setData('move', JSON.stringify({ pid, uid: u.id }))}>
      ```
      Replace with:
      ```js
        const span = SPAN(u.type)
        const tall = span > 1
        const tallStyle = tall ? { height: span * 30 + (span - 1) * 7 } : undefined
        const kindCls = u.kind === 'ev' ? 'ev' : u.kind === 'solar' ? 'solar' : ''
        const cls = `unit ${kindCls}${tall ? ' tall' : ''}${flashId === u.id ? ' in surge' : ''}`
        return (
          <div className={cls} style={tallStyle} draggable
            onDragStart={(e) => e.dataTransfer.setData('move', JSON.stringify({ pid, uid: u.id }))}>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "span \* 30 + (span - 1) \* 7" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 8** — `admin/src/pages/LoadCalc.jsx` — `renderUnit()`: circuit amp label shows the explicit `volt` field when a circuit carries one (independent of `pole`), falling back to the existing pole-2-implies-240V behavior otherwise. Backward compatible: old saved circuits have no `volt` field, so they render exactly as before.
      Find:
      ```jsx
                <span className="camp">{c.amp}A{c.pole === 2 ? '·240V' : ''}</span>
      ```
      Replace with:
      ```jsx
                <span className="camp">{c.amp}A{c.volt ? '·' + c.volt + 'V' : c.pole === 2 ? '·240V' : ''}</span>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "c.volt ? '·' + c.volt" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — new breaker types (Kuo's Q1/Q2 semantics; engine above must already be generalized)

- [ ] **Step 9** — `admin/src/pages/LoadCalc.jsx` — Add `p2_120` and `quad4` to `TYPES`, inserted after the `quad` entry and before `ev`.
      Find:
      ```js
        quad: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 15, pole: 1 }, { label: '', amp: 30, pole: 2 }, { label: '', amp: 15, pole: 1 }] },
        ev: { slots: 2, kind: 'ev', mk: () => [{ label: 'EV CHARGER', amp: 30, pole: 2 }] },
      ```
      Replace with:
      ```js
        quad: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 15, pole: 1 }, { label: '', amp: 30, pole: 2 }, { label: '', amp: 15, pole: 1 }] },
        // single 120V circuit occupying 2 physical slots (old-style / wide-frame single-pole breaker) — NOT a 2-pole circuit
        p2_120: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 20, pole: 1, volt: 120 }] },
        // single old-style large-frame 2-pole breaker occupying 4 physical slots — one 240V circuit, not two breakers
        quad4: { slots: 4, kind: 'normal', mk: () => [{ label: '', amp: 100, pole: 2 }] },
        ev: { slots: 2, kind: 'ev', mk: () => [{ label: 'EV CHARGER', amp: 30, pole: 2 }] },
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "p2_120:\|quad4:" admin/src/pages/LoadCalc.jsx` → 2 matches in TYPES (plus later matches from Step 10/12/22, expected to grow).

- [ ] **Step 10** — `admin/src/pages/LoadCalc.jsx` — Add matching `PALETTE` cards for `p2_120` and `quad4`, inserted after the `quad` card and before `ev`.
      Find:
      ```js
        { type: 'quad', glyph: 'quad', bars: 3, t: 'Quad space-saver', s: '占 2 槽 · 120/240/120' },
        { type: 'ev', glyph: 'p2 evg', bars: 2, t: 'EV Charger 30A', s: '蓝 · 占 2 槽 · 240V', border: '#bfdbfe', tc: '#1d4ed8', sc: '#60a5fa' },
      ```
      Replace with:
      ```js
        { type: 'quad', glyph: 'quad', bars: 3, t: 'Quad space-saver', s: '占 2 槽 · 120/240/120' },
        { type: 'p2_120', glyph: 'p2_120', bars: 1, t: '1-Pole 120V(宽体)', s: '占 2 槽 · 单路 120V' },
        { type: 'quad4', glyph: 'p2', bars: 2, t: '2-Pole 100A(大框架)', s: '占 4 槽 · 老式宽体 240V' },
        { type: 'ev', glyph: 'p2 evg', bars: 2, t: 'EV Charger 30A', s: '蓝 · 占 2 槽 · 240V', border: '#bfdbfe', tc: '#1d4ed8', sc: '#60a5fa' },
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "1-Pole 120V(宽体)\|2-Pole 100A(大框架)" admin/src/pages/LoadCalc.jsx` → 2 matches.

## admin/src/pages/LoadCalc.jsx — Bug 2, inline subpanel rename (Kuo's Q3 override — NOT window.prompt)

- [ ] **Step 11** — `admin/src/pages/LoadCalc.jsx` — Add `editingSubId` state (tracks which subpanel's name is currently being edited).
      Find:
      ```js
        const [msg, setMsg] = useState('')
        const uidRef = useRef(1)
      ```
      Replace with:
      ```js
        const [msg, setMsg] = useState('')
        const [editingSubId, setEditingSubId] = useState(null)
        const uidRef = useRef(1)
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "editingSubId" admin/src/pages/LoadCalc.jsx` → at least 1 match (grows through Step 13).

- [ ] **Step 12** — `admin/src/pages/LoadCalc.jsx` — Add `commitSubRename(sid, raw)`, placed right after `removeSubpanel`. Reuses §3.2's validation rule verbatim (trim, empty falls back to old name, truncate to 24 chars) and keeps the main-panel feeder's `"→ SUB-n"` label in sync, same as the original prompt-based design — just committed from an input value instead of a prompt return value.
      Find:
      ```js
      function removeSubpanel(sid) {
        setUnits((p) => p.filter((u) => !(u.kind === 'feeder' && u.subId === sid)))
        setSubpanels((ps) => ps.filter((s) => s.id !== sid))
      }
      ```
      Replace with:
      ```js
      function removeSubpanel(sid) {
        setUnits((p) => p.filter((u) => !(u.kind === 'feeder' && u.subId === sid)))
        setSubpanels((ps) => ps.filter((s) => s.id !== sid))
        setEditingSubId((v) => (v === sid ? null : v))
      }

      function commitSubRename(sid, raw) {
        const sp = subpanels.find((s) => s.id === sid)
        if (!sp) { setEditingSubId(null); return }
        const name = raw.trim().slice(0, 24) || sp.name
        setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, name } : s)))
        // main-panel feeder's '→ SUB-n' label must follow the rename (addSubpanel bound the old name at creation time)
        setUnits((p) => p.map((u) => (u.kind === 'feeder' && u.subId === sid)
          ? { ...u, circuits: [{ ...u.circuits[0], label: '→ ' + name }] } : u))
        setEditingSubId(null)
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "function commitSubRename" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 13** — `admin/src/pages/LoadCalc.jsx` — Subpanel render: replace the static `{sp.name}` in the subpanel's title bar with a click-to-edit `<button>` that swaps to an `<input>` while editing. Enter commits (blurs, which triggers commit). Escape resets the input's value back to the current name before blurring, so it always commits as a no-op rename rather than relying on React's unmount timing — deterministic cancel regardless of blur/unmount ordering.
      Find:
      ```jsx
                        {renderPanel(sp.id, sp.slots, sp.units, sp.name, 'Sub Panel',
                          <><span className="dot amber" /> {sp.name} <span className="mono">{sp.feederAmp}A</span></>, 'sub')}
      ```
      Replace with:
      ```jsx
                        {renderPanel(sp.id, sp.slots, sp.units, sp.name, 'Sub Panel',
                          <><span className="dot amber" />{' '}
                          {editingSubId === sp.id
                            ? <input className="subname-edit" autoFocus defaultValue={sp.name}
                                onBlur={(e) => commitSubRename(sp.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') { e.currentTarget.value = sp.name; e.currentTarget.blur() }
                                }} />
                            : <button type="button" className="subname" onClick={() => setEditingSubId(sp.id)}>{sp.name}</button>}
                          {' '}<span className="mono">{sp.feederAmp}A</span></>, 'sub')}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "className=\"subname-edit\"\|className=\"subname\"" admin/src/pages/LoadCalc.jsx` → 2 matches.

## admin/src/pages/LoadCalc.jsx — Bug 3, 15, Q7 hints

- [ ] **Step 14** — `admin/src/pages/LoadCalc.jsx` — Bug 3: replace the subpanel Feeder `<select>` (fixed to `FEEDER_AMPS`) with a free-entry number input backed by a shared `<datalist>` (rendered once, outside the `subpanels.map` loop, to avoid duplicate DOM ids).
      Find:
      ```jsx
                          <label>Feeder
                            <select value={sp.feederAmp} onChange={(e) => setSubFeeder(sp.id, parseInt(e.target.value, 10))}>
                              {FEEDER_AMPS.map((a) => <option key={a} value={a}>{a} A</option>)}
                            </select>
                          </label>
      ```
      Replace with:
      ```jsx
                          <label>Feeder
                            <input type="number" min="15" max="400" step="5" list="feederPresets" value={sp.feederAmp}
                              onChange={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n > 0) setSubFeeder(sp.id, n) }} />
                          </label>
      ```
      Then find (the line right after the main panel's `renderPanel(...)` call, before `{subEnabled && subpanels.map((sp) => {`):
      ```jsx
                  {renderPanel('main', slots, units, brandTag, 'Load Centre',
                    <><span className="dot" /> MAIN <span className="mono">{calc.svc}A</span></>)}

                  {subEnabled && subpanels.map((sp) => {
      ```
      Replace with:
      ```jsx
                  {renderPanel('main', slots, units, brandTag, 'Load Centre',
                    <><span className="dot" /> MAIN <span className="mono">{calc.svc}A</span></>)}

                  {subEnabled && <datalist id="feederPresets">{FEEDER_AMPS.map((a) => <option key={a} value={a} />)}</datalist>}
                  {subEnabled && subpanels.map((sp) => {
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "list=\"feederPresets\"\|id=\"feederPresets\"" admin/src/pages/LoadCalc.jsx` → 2 matches.

- [ ] **Step 15** — `admin/src/pages/LoadCalc.jsx` — Solar disclaimer: append the clarifying sentence to the palette `.tip` text (DESIGN.md §3.6 point 2).
      Find:
      ```jsx
                <div className="tip">点击已放入的 breaker 可<b>命名 + 设容量</b>。EV 自动按 100% 计入负荷(主面板 + 所有 subpanel 一起算),Solar 不计入需求负荷。{subEnabled ? '加 subpanel 后主面板自动生成一条紫色 feeder,拖 breaker 到 subpanel 里即可。盘内已放的 breaker / feeder 可再<b>拖动换位置</b>(如留 1+3 布局)。' : '需要分面板时,上方打开 Subpanel 开关。'}</div>
      ```
      Replace with:
      ```jsx
                <div className="tip">点击已放入的 breaker 可<b>命名 + 设容量</b>。EV 自动按 100% 计入负荷(主面板 + 所有 subpanel 一起算),Solar 不计入需求负荷。Solar 为发电源,不抵扣 8-200 计算负荷;并网母线校验(120% 规则)不在本工具范围,由电工在图纸阶段确认。{subEnabled ? '加 subpanel 后主面板自动生成一条紫色 feeder,拖 breaker 到 subpanel 里即可。盘内已放的 breaker / feeder 可再<b>拖动换位置</b>(如留 1+3 布局)。' : '需要分面板时,上方打开 Subpanel 开关。'}</div>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "并网母线校验(120% 规则)不在本工具范围" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 16** — `admin/src/pages/LoadCalc.jsx` — Q7 hint 1: grey helper text next to the area input, reusing the existing (currently unused) `.hint` CSS class.
      Find:
      ```jsx
                  <div className="srow">
                    <span className="sl">居住面积</span>
                    <span className="sc"><input type="number" value={area} onChange={(e) => setArea(e.target.value)} /><em>m²</em></span>
                  </div>
                  <div className="srow">
                    <span className="sl">供热来源</span>
      ```
      Replace with:
      ```jsx
                  <div className="srow">
                    <span className="sl">居住面积</span>
                    <span className="sc"><input type="number" value={area} onChange={(e) => setArea(e.target.value)} /><em>m²</em></span>
                  </div>
                  <div className="hint">地下室部分按 8-110 计 75%,请勿把全部地下室面积按 100% 填入此栏。</div>
                  <div className="srow">
                    <span className="sl">供热来源</span>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "地下室部分按 8-110 计 75%" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 17** — `admin/src/pages/LoadCalc.jsx` — Q7 hint 2: print-visible footnote citing the CEC 8-200(1)(b) minimum service. Must live inside `#panelPrint` (the `.stage` div) — the print stylesheet hides everything except `#panelPrint`, so the existing on-screen verdict note is invisible when printed; this is a separate, print-visible line, not a duplicate.
      Find:
      ```jsx
                  {subEnabled && subpanels.map((sp) => {
      ```
      (this is the map call from Step 14 — find its closing, i.e. the line immediately after the map's closing `})}` and before the `.stage` div's closing `</div>`):
      ```jsx
                  })}
                </div>
              </div>
            </div>
      ```
      Replace with:
      ```jsx
                  })}
                  <div className="hint" style={{ width: '100%', textAlign: 'center' }}>计算负荷不低于 CEC 8-200(1)(b) 最小 service 下限(minSvc {calc.minSvc}A)。</div>
                </div>
              </div>
            </div>
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "计算负荷不低于 CEC 8-200(1)(b)" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — Bug 4 CSS (do before Step 20's sticky rule, which depends on the final breakpoint value)

- [ ] **Step 18** — `admin/src/pages/LoadCalc.jsx` — Grid blowout guard: `1fr` → `minmax(0,1fr)`, plus `.stage{overflow-x:auto}` so the panel column scrolls internally instead of ever pushing the page wide.
      Find:
      ```css
      .lc .grid{display:grid;grid-template-columns:230px 1fr 320px;gap:18px;align-items:start}
      ```
      Replace with:
      ```css
      .lc .grid{display:grid;grid-template-columns:230px minmax(0,1fr) 320px;gap:18px;align-items:start}
      ```
      Then find:
      ```css
      .lc .stage{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 14px 26px;background:radial-gradient(120% 80% at 50% 0,#fafafa,transparent)}
      ```
      Replace with:
      ```css
      .lc .stage{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 14px 26px;background:radial-gradient(120% 80% at 50% 0,#fafafa,transparent);overflow-x:auto}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "minmax(0,1fr)\|.lc .stage{.*overflow-x:auto" admin/src/pages/LoadCalc.jsx` → 2 matches.

- [ ] **Step 19** — `admin/src/pages/LoadCalc.jsx` — Breakpoint correction: single-column threshold `1100px` → `1360px` (three columns only appear when they genuinely fit; see DESIGN.md §3.4 for the pixel math).
      Find:
      ```css
      @media(max-width:1100px){.lc .grid{grid-template-columns:1fr}}
      ```
      Replace with:
      ```css
      @media(max-width:1360px){.lc .grid{grid-template-columns:1fr}}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "max-width:1360px" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 20** — `admin/src/pages/LoadCalc.jsx` — Panel breathing room: widen the main/sub panel and subctl bar by 8px each, matching DESIGN.md §3.4 point 3 exactly (slot content width unchanged).
      Find:
      ```css
      .lc .panel{width:392px;border-radius:16px;padding:16px 32px;background:linear-gradient(160deg,#2A2F34,#1B1E21);box-shadow:0 30px 60px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06);position:relative}
      .lc .panel.sub{width:360px;background:linear-gradient(160deg,#2b2740,#1c1830);box-shadow:0 20px 44px rgba(50,20,90,.28),inset 0 1px 0 rgba(255,255,255,.06)}
      ```
      Replace with:
      ```css
      .lc .panel{width:400px;border-radius:16px;padding:16px 36px;background:linear-gradient(160deg,#2A2F34,#1B1E21);box-shadow:0 30px 60px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06);position:relative}
      .lc .panel.sub{width:368px;background:linear-gradient(160deg,#2b2740,#1c1830);box-shadow:0 20px 44px rgba(50,20,90,.28),inset 0 1px 0 rgba(255,255,255,.06)}
      ```
      Then find:
      ```css
      .lc .subctl{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:2px;padding:8px 10px;background:#F5F3FF;border:1px solid #E9E3FE;border-radius:12px;width:360px}
      ```
      Replace with:
      ```css
      .lc .subctl{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:2px;padding:8px 10px;background:#F5F3FF;border:1px solid #E9E3FE;border-radius:12px;width:368px}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "width:400px.*padding:16px 36px\|width:368px" admin/src/pages/LoadCalc.jsx` → 3 matches (panel, subctl, and panel.sub's own line unaffected count — confirm panel.sub width:368px appears once, subctl width:368px appears once).

- [ ] **Step 21** — `admin/src/pages/LoadCalc.jsx` — Bug 1: sticky breaker palette column, gated to the corrected breakpoint (`min-width:1361px`, one more than Step 19's `1360px` single-column cutoff, so sticky never applies in single-column mode).
      Find:
      ```css
      @media(max-width:1360px){.lc .grid{grid-template-columns:1fr}}
      ```
      Replace with:
      ```css
      @media(max-width:1360px){.lc .grid{grid-template-columns:1fr}}
      @media(min-width:1361px){
        .lc .grid>.col:first-child{position:sticky;top:0;max-height:calc(100vh - 72px);overflow-y:auto}
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "min-width:1361px" admin/src/pages/LoadCalc.jsx` → 1 match.

## admin/src/pages/LoadCalc.jsx — remaining glyph/focus CSS

- [ ] **Step 22** — `admin/src/pages/LoadCalc.jsx` — Glyph for `p2_120`: one taller/wider green bar (single pole, not two hot legs — deliberately visually distinct from `p2`'s green+yellow pair).
      Find:
      ```css
      .lc .brk .glyph.quad i:nth-child(1){top:7px;width:10px}.lc .brk .glyph.quad i:nth-child(2){top:18px;width:18px;background:#facc15;box-shadow:none}.lc .brk .glyph.quad i:nth-child(3){top:32px;width:10px}
      ```
      Replace with:
      ```css
      .lc .brk .glyph.quad i:nth-child(1){top:7px;width:10px}.lc .brk .glyph.quad i:nth-child(2){top:18px;width:18px;background:#facc15;box-shadow:none}.lc .brk .glyph.quad i:nth-child(3){top:32px;width:10px}
      .lc .brk .glyph.p2_120 i{top:14px;height:18px;width:16px}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "glyph.p2_120 i{" admin/src/pages/LoadCalc.jsx` → 1 match.

- [ ] **Step 23** — `admin/src/pages/LoadCalc.jsx` — Focus/hover styles for the inline-rename `<button>`/`<input>` pair added in Step 13 (a11y: visible `:focus-visible` on the button, visible focus ring on the input — the `.main` bar has a dark background, so focus rings use light colors).
      Find:
      ```css
      .lc .main .dot.amber{background:#a78bfa;box-shadow:0 0 10px #a78bfa}
      @keyframes lc-pulse{50%{opacity:.4}}
      ```
      Replace with:
      ```css
      .lc .main .dot.amber{background:#a78bfa;box-shadow:0 0 10px #a78bfa}
      @keyframes lc-pulse{50%{opacity:.4}}
      .lc .subname{background:none;border:none;padding:0;color:inherit;font:inherit;font-weight:800;cursor:pointer}
      .lc .subname:hover{text-decoration:underline}
      .lc .subname:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:3px}
      .lc .subname-edit{font:inherit;font-weight:800;color:var(--ink);background:#fff;border:1px solid #8b5cf6;border-radius:6px;padding:1px 6px;width:110px;outline:none}
      .lc .subname-edit:focus{border-color:#7c3aed;box-shadow:0 0 0 2px rgba(124,58,237,.25)}
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n ".lc .subname:focus-visible\|.lc .subname-edit:focus" admin/src/pages/LoadCalc.jsx` → 2 matches.

## admin/src/utils/cecLoad.js — Solar fix

- [ ] **Step 24** — `admin/src/utils/cecLoad.js` — `connectedAmps`: exclude `kind==='solar'` (PV is a source, never a load) alongside the existing `feeder` exclusion; update the comment above it.
      Find:
      ```js
      // ponytail: connected-load estimate, not a full 8-200 demand calc; conservative (high). Feeder breakers excluded.
      export function connectedAmps(units) {
        return (units || []).reduce((sum, u) => {
          if (u.kind === 'feeder') return sum
          return sum + (u.circuits || []).reduce((a, c) => a + (Number(c.amp) || 0), 0)
        }, 0)
      }
      ```
      Replace with:
      ```js
      // ponytail: connected-load estimate, not a full 8-200 demand calc; conservative (high). Feeder + solar breakers excluded — solar is a source, not a load, and must never inflate a "connected load" figure.
      export function connectedAmps(units) {
        return (units || []).reduce((sum, u) => {
          if (u.kind === 'feeder' || u.kind === 'solar') return sum
          return sum + (u.circuits || []).reduce((a, c) => a + (Number(c.amp) || 0), 0)
        }, 0)
      }
      ```
      verify: `cd admin && npm run build` → succeeds. `grep -n "u.kind === 'feeder' || u.kind === 'solar'" admin/src/utils/cecLoad.js` → 1 match.

## admin/src/utils/cecLoad.selfcheck.mjs — regression assertions

- [ ] **Step 25** — `admin/src/utils/cecLoad.selfcheck.mjs` — Import `connectedAmps` and add regression assertions: mixed-unit exclusion correctness, plus the real SUB-1 production shape (2×20A solar + assorted loads). Uses self-consistent synthetic numbers, not the disputed "≤60A" claim from DESIGN.md §3.6 (see DESIGN.md `## Review`, factual note) — only asserts that solar is excluded from the sum.
      Find:
      ```js
      import { basicLoad, heatDemand, rangeDemand, otherDemand, computeLoad } from './cecLoad.js'
      ```
      Replace with:
      ```js
      import { basicLoad, heatDemand, rangeDemand, otherDemand, computeLoad, connectedAmps } from './cecLoad.js'
      ```
      Then find:
      ```js
      console.log('cecLoad self-check: all assertions passed')
      ```
      Replace with:
      ```js
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

      console.log('cecLoad self-check: all assertions passed')
      ```
      verify: `node admin/src/utils/cecLoad.selfcheck.mjs` → prints `cecLoad self-check: all assertions passed`, exit code 0.

---

## Test plan

- **Full self-check**: `node admin/src/utils/cecLoad.selfcheck.mjs` → all assertions pass including the two new ones from Step 25.
- **Build**: `cd admin && npm run build` → succeeds with no errors (run once more at the end, after all 25 steps, as the final gate).
- **Lint** (final gate only, not per-step — `eslint .` spans the whole `admin/` tree so pre-existing warnings elsewhere shouldn't block individual steps): `cd admin && npm run lint` → no new errors in `LoadCalc.jsx` / `cecLoad.js` / `cecLoad.selfcheck.mjs` compared to a pre-change baseline run.
- **Manual — Bug 1 (sticky palette)**: at ≥1361px viewport width, scroll the page; the Breakers column should stick to the top of the scroll area once it reaches the top. Below 1361px (single column), it must NOT stick (confirm by resizing across the boundary).
- **Manual — Bug 2 (inline rename)**: click a subpanel's name in its title bar → becomes an editable input, auto-focused. Type a new name, press Enter → commits, input reverts to text, and the main panel's feeder label ("→ SUB-n") updates to match. Click again, type a name, press Escape → reverts to the previous name (no rename). Click again, clear the field entirely, blur (click elsewhere) → falls back to the previous name (not empty). Type 40 characters, blur → truncated to 24.
- **Manual — Bug 3 (feeder free entry)**: in a subpanel's Feeder field, type `50`, tab away → accepted, subctl "连接负荷 vs feeder" comparison updates to use 50A. Type a value outside 15–400 or non-numeric → rejected (previous valid value is retained, no crash). The datalist dropdown still offers 40/60/100/125 as quick picks.
- **Manual — Bug 4 (overflow)**: at 1366×768 and 1280×800 viewports, with 2 subpanels open, confirm the three-column layout has no horizontal page scroll and no clipped right column; below 1360px, confirm the layout is a clean single column (not a squeezed three-column).
- **Manual — Bug 5 (new breaker types + placement engine)**:
  - Drag `1-Pole 120V(宽体)` (p2_120) onto an empty 2-slot spot → places successfully, occupies exactly 2 slots, shows amp + "·120V" (not "·240V"), no amber tint on its indicator.
  - Drag `2-Pole 100A(大框架)` (quad4) onto an empty 4-slot run → places successfully, occupies exactly 4 contiguous slots at ~141px height, shows amber tint (pole 2, implicit 240V).
  - Drag quad4 onto a spot that overlaps an existing breaker → rejected (no placement, no overlap on screen).
  - Drag quad4 near the bottom of the panel such that its 4-slot span would run past the last slot → rejected.
  - Place a quad4, then drag-move it to a different empty 4-slot spot within the same panel → succeeds; drag-move it onto a spot overlapping itself only → allowed (no false self-collision, `exceptId` still works); drag-move onto a spot overlapping a different unit → rejected.
  - Shrink the panel's slot count so a placed quad4 no longer fits → it is silently removed (existing `keepFitting` crop behavior, now correctly generalized to span 4, not just span 2).
- **Manual — Solar tip + hints**: palette `.tip` text includes the new "并网母线校验(120% 规则)不在本工具范围" sentence. Area input row shows the grey "地下室部分按 8-110 计 75%" hint. Print preview (`window.print()` / browser print dialog) shows the "计算负荷不低于 CEC 8-200(1)(b)…" footnote under the panel diagram(s), and does NOT show it if `#panelPrint`-hidden elements are checked (confirm it's the only new visible text in the print output besides the diagram).
- **Red-line spot checks**:
  - *Electrical correctness*: `grep -n "kind === 'solar'" admin/src/utils/cecLoad.js` shows solar excluded from `connectedAmps`; `grep -n "evW" admin/src/utils/cecLoad.js` confirms `computeLoad` still has no PV/solar parameter anywhere (PV never offsets `calc.amps`). No busbar-rating input or 120%-rule logic exists anywhere (`grep -n "busbar\|120%" admin/src/pages/LoadCalc.jsx admin/src/utils/cecLoad.js` → no matches, confirming Q5/Q6 stayed unimplemented as decided).
  - *Trust-boundary validation*: feeder input rejects non-numeric and ≤0 (guard clause from Step 14 present: `grep -n "Number.isFinite(n) && n > 0" admin/src/pages/LoadCalc.jsx`); rename trims/truncates/falls back (Step 12's `commitSubRename` body present).
  - *Data loss*: `toggleSub`'s `window.confirm` before deleting subpanels is untouched (`grep -n "window.confirm" admin/src/pages/LoadCalc.jsx` → still present); `save()`'s catch block still calls `flash(...)` on failure, no silent swallow.
  - *Accessibility*: subname edit entry is a real `<button type="button">` (native keyboard/focus support), with `:focus-visible` CSS present (Step 23); Tab to it and press Enter/Space to confirm it activates without a mouse.
