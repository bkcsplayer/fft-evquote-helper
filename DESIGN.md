# DESIGN: Load Calculator 第二轮专业审查 — 撤销伪"超载"判定 + 实现 CEC 64-112(4)(c)(d) 125% 母线核算 + STANDATA 24-ECB-008 合规核实

> Round 2(2026-07-25)。上一轮(已实现,commit 10b97d9/e2a3bd7)全文存档于本文件下半部 `# ARCHIVE — Round 1`。
> 本轮权威输入:Kuo 提供的持证从业者规范说明(64-112(4)(c)&(d) 住宅 125%、STANDATA 24-ECB-008、8-106(8) 对光伏住宅不可用)。按指示,条款号与系数**直接采用,不再自行标置信度**;未发现该输入与代码库其他部分存在内部矛盾。

## 0. Task tier & Skill Manifest
- Tier: **STANDARD** — 多文件前端改动(LoadCalc.jsx + cecLoad.js + selfcheck),电气规范正确性判断;无 schema/API 变更(load_calc JSONB 后端 opaque,向后兼容扩展)。
- Skills: `cmm`, `codebase-memory`, `ponytail-review`(MANDATORY-INFRA);`ui-ux-pro-max`(UI 权威,本轮已咨询并折入,见 §3.2 打印可见性发现);无后端/DB/部署技能需要。
- Planned advisor consults: **1**(完工 sign-off)。

---

## 1. Goal

1. 裁定 `connectedAmps` 的"连接负荷 vs feeder → 超载!"检查是否成立;给出 FFT-2026-0002 SUB-1(85A/60A)与 SUB-2(175A/60A)两条警告的正确专业结论;给出修法。
2. 依据 64-112(4)(c)&(d)(住宅 125%)正式设计母线核算:新增 busbar 额定字段,主面板与任意 subpanel 装 Solar 均支持。
3. 逐行核实 `computeLoad()` 的 EV 处理是否符合 STANDATA 24-ECB-008("不参与任何折减、最后一步 100% 加回")。
4. 评估勘察 SOP 检查清单是否需要进 evquote 表单层(结论:超出本轮,单独立项,依据见 §3.4)。

## 2. Current real flow

(本次全文精读 LoadCalc.jsx 761 行 + cecLoad.js 67 行 + selfcheck 60 行 + models.py Survey 段;行号为当前 working copy 实数)

- **connectedAmps 消费链**:`cecLoad.js:39-44` 求和所有非 feeder/非 solar 断路器额定 → `LoadCalc.jsx:434-435` `camps = connectedAmps(sp.units)`、`oload = camps > sp.feederAmp` → `LoadCalc.jsx:459` 渲染 `连接负荷 {camps}A / feeder {sp.feederAmp}A · 超载!`(`.oload.bad` 琥珀 pill,CSS 706 行)。**只对 subpanel 渲染,主面板无此行。**
- **Solar 单元**:`TYPES.solar`(jsx:18,默认 40A 2-pole,`kind:'solar'`);FFT-2026-0002 实况为 SUB-1 内 2×20A。`computeLoad` 不收 PV 参数(正确,ADR-003 不变)。
- **数据形状**:顶层 `{brand, main:'100 A'字符串, slots, units[], subEnabled, subpanels[], calc{}}`;subpanel = `{id, name, feederAmp, slots, units}` — **无 busbar 字段**(本轮新增点)。
- **面板渲染**:`renderPanel(pid,...)`(jsx:324-355)主/子共用;subpanel 包在 `.substage`(jsx:437-462)内:feedtag → renderPanel → `.subctl`(Feeder/Slots 输入 + oload pill + 删除按钮)。
- **打印**:`@media print`(CSS 746-760)只显示 `#panelPrint` 子树(= `.stage`,jsx:428);**`.subctl` 在打印中 `display:none`(CSS 758)** — 任何要上报批打印件的信息不能只放 `.subctl`。
- **EV 求和**:jsx:266-267 跨主面板+所有 subpanel,`amp × 240` @100%;`computeLoad` cecLoad.js:48-67。
- **提示文案**:jsx:419 现写"并网母线校验(120% 规则)不在本工具范围"——实现 64-112 后需改写(且"120%"对住宅是错的系数,加方住宅为 125%)。
- **Survey 后端**(问题 4):`backend/app/models/models.py:156-180` — Survey 只有排期握手/定金/notes/photos,**无任何结构化 checklist 字段**;加字段 = 迁移 + schema + admin 表单改造。

## 3. Chosen solution

**YAGNI rung:§3.1 = 第 5 级(最小改动:删错误判定+改文案);§3.2 = 第 6 级(最小新代码:一个纯函数+一个字段+一条状态行)。** 更便宜台阶为何不行见 §4。

### 3.1 "连接负荷超载"裁定与修法(ADR-005)

**裁定:上一实例的判断正确,予以确认。** CEC 判断馈线/母线是否够用的唯一标准是 **Section 8 需求负荷(demand,瓦特,套需求系数)**,规范里不存在"分支断路器铭牌额定相加 ≤ feeder 额定"这条规则——断路器额定合计远超 feeder 额定是每一块正常面板的常态,这正是需求系数体系存在的意义。现有"超载!"是用错误标准产生的系统性误报。

**三个选项的取舍:**
- **(b) 做真·demand 版 feeder 校验 — 否决。** 工具存的是断路器安数 + 自由文本 label,没有每路的**实际负载瓦数和器具类别**(15A 断路器 ≠ 15A 负载;"hot tub"是 label 不是结构化字段)。没有数据就做不出合法的 8-200 式子面板需求计算,硬做只会输出"看起来权威的错数"——比现在的误报更危险。
- **(a) 完全删除 — 次选。** 额定合计本身是真实面板 panel schedule 上存在的数字,勘察员可用它和实物照片核对录入是否漏项,保留成本为零。
- **(c) 保留数字、撤销判定 — 选定。** 删除 `>` 比较与"超载!"字样及 ok/bad 双态样式,只留中性信息行。

**具体改动:**
1. `LoadCalc.jsx:435` 删除 `const oload = ...` 一行;`jsx:459` 整行替换为:
   ```jsx
   <span className="oload info">断路器额定合计 {camps}A · 非负荷计算,仅供与实物面板核对</span>
   ```
2. CSS:删 `.oload.ok/.oload.bad`(705-706 行),新增 `.lc .subctl .oload.info{color:var(--ink3);background:var(--app);border:1px solid var(--line2)}`(中性灰,无 ✓/✗,避免读成"一项通过的检查"——ui-ux-pro-max)。
3. `cecLoad.js:36-38` 注释改写:"panel-schedule 核对用合计;**不是**过载检查——CEC 以 demand 判 feeder,断路器额定相加不构成任何判定"。函数名与签名不动(selfcheck 与调用零波及)。

**FFT-2026-0002 两条警告的正确专业结论:**

- **SUB-1(outside plug 15A + counter plugs 15A + dish washer 15A + hot tub 40A-2P = 85A 额定合计,feeder 60A):不超标,现"超载!"为误报。** 按 demand 判:唯一 Section-8 量级负载是 hot tub,按 8-200(1)(a)(vi) 100% 计——挂 40A 2-pole 断路器意味着铭牌 ≤9.6kW(40A@240V);洗碗机 ~1.4kW 间歇;两路插座回路属基础负荷范畴。**取绝对最坏同时率**:9.6 + 1.4 + ~3(两路插座满打) ≈ 14kW ÷ 240V ≈ **58A ≤ 60A**;现实需求约 45-50A。60A feeder 合规(前提核对:hot tub 铭牌确 ≤9.6kW,与其 40A 断路器自洽)。
- **SUB-2(175A 额定合计,feeder 60A):从 175A 这个数字得不出任何结论——该警告作为方法不成立,不能证明超载,也不能证明不超载。** 175A 额定合计配 60A feeder 在以照明/插座/小家电回路为主时完全正常;只有当其中含**多个 100% 需求的大负载**(第二个 hot tub、桑拿、电采暖、EVSE 等)才可能真超。**行动**:请把 SUB-2 各回路的实际负载(器具 + 瓦数)列出来人工核一次(§8 Q5);工具端一律撤下"超载!",不做假判。

### 3.2 CEC 64-112(4)(c)&(d) 住宅 125% 母线核算(ADR-006)

**规则(采用 Kuo 提供的权威输入,不再另行标注置信度):** 馈入某母线的所有电源侧过流装置额定之和(该盘主 OCPD + 该盘内所有 PV 回馈断路器)≤ 母线额定 × **125%**(dwelling;120% 是非住宅系数与 NEC 规则,Alberta 住宅一律 125%)。允许的 PV breaker 上限 = busbar × 1.25 − 主 OCPD。

**校验对象是 Solar breaker 所在的那块盘自己的母线**:PV 在 SUB-1 → 查 SUB-1 的 busbar,主 OCPD = SUB-1 的 feeder 额定;PV 在主面板 → 查主面板 busbar,主 OCPD = main breaker。实现按 pid 通用,**不写死 subpanel**。

#### 3.2.1 纯函数(cecLoad.js 新增,含一个一行助手)

```js
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
```

125% 常量直接内联并注释"dwelling only"——本工具就是 8-200 单户住宅计算器,不做非住宅分支(YAGNI,红线不受影响)。

#### 3.2.2 新字段 `busbar`(number | null,null = 跟随)

- **顶层** `busbar: number|null`,生效值 = `busbar ?? (parseInt(main,10) || 100)`。
- **subpanel** `{...s, busbar: number|null}`,生效值 = `busbar ?? feederAmp`。
- **"null = 跟随"而非"创建时复制"**:避免"用户改了 main/feeder 后 busbar 是否联动"的脏标记问题——没显式填过就永远跟随,填过就以显式值为准。旧存档无此字段 → undefined ?? 同 null → 行为 = 现状,**JSONB 向后兼容,无迁移**(save 时随 value 一并写入,jsx:122)。
- 现实动机:母线额定常大于主 OCPD(225A bus / 200A main;100A feeder 配 125A bus subpanel),默认跟随只是保守起点,UI 必须允许改。

#### 3.2.3 UI 输入(ui-ux-pro-max 折入)

- **主面板**:`.cfg` 行(jsx:378-393)在 Main breaker 后新增
  ```jsx
  <label>Busbar (A)<input className="w-slot" type="number" min="15" max="800" step="5"
    placeholder={String(parseInt(main, 10) || 100)}
    value={busbar ?? ''}
    onChange={(e) => { const v = e.target.value; if (v === '') { setBusbar(null); return }
      const n = parseInt(v, 10); if (Number.isFinite(n) && n > 0) setBusbar(n) }} /></label>
  ```
  真 `<label>` 包裹(既有模式);placeholder 显示继承值;清空 = 回到跟随。
- **subpanel**:`.subctl`(jsx:451-461)Feeder/Slots 旁同款 `Busbar` 输入,placeholder = `sp.feederAmp`,onChange 写 `setSubBusbar(sid, n|null)`(仿 `setSubFeeder`,只改 subpanels,不碰 units)。
- 输入守卫(信任边界红线):空串 → null;NaN/≤0 → 忽略不提交;范围 15-800。

#### 3.2.4 校验状态行(必须打印可见)

新增渲染助手(jsx,renderPanel 附近):

```jsx
function render64112(units, mainOcpd, busbarEff) {
  const chk = busbarCheck({ busbar: busbarEff, mainOcpd, solarA: solarAmpsOf(units) })
  if (!chk || solarAmpsOf(units) === 0) return null // 无 solar 的盘不出现此行
  return (
    <div className={`code64 ${chk.ok ? 'ok' : 'bad'}`}>
      {chk.ok ? '✓' : '✗'} 64-112(4)(c)(d): 主OCPD {mainOcpd}A + PV {solarAmpsOf(units)}A = {chk.sum}A
      {chk.ok ? ' ≤ ' : ' > '}busbar {busbarEff}A × 125% = {chk.limit}A
      {!chk.ok && <div className="fixpath">超限 · 本盘 PV breaker 上限 {chk.maxPv}A · 出路: line-side tap / 64-112(g) 限流 / 换大 busbar 的盘</div>}
    </div>
  )
}
```

(实现时把 `solarAmpsOf` 结果存局部变量,勿调两次;上面是语义示意。)

- **放置**:主面板 → `.stage` 内、`renderPanel('main',…)` 之后;subpanel → `.substage` 内、`renderPanel` 与 `.subctl` **之间**。两处都在 `#panelPrint` 子树内 → 打印件(报批用途)自带核算结论。**绝不放进 `.subctl`**——它打印时 `display:none`(CSS 758),放错位置该行在报批打印件上静默消失(ui-ux-pro-max 本轮关键发现)。
- **样式**:`.code64.ok` 用既有 `--accent-d`/`--accent-bg`/#A7F3D0 token;`.code64.bad` 用 `--rose`/`--red-bg`/#FECACA(规范违规级,不用 amber 提示级);✓/✗ 符号保证非纯色语义(a11y);打印已有 `print-color-adjust:exact`,黑白打印靠符号仍可读。
- **预期行为声明(防止被当 bug"修掉")**:FFT-2026-0002 SUB-1 若不填 busbar,生效值 = feeder 60A → 60+40=100 > 75 显示 ✗——这是**正确的**:它逼勘察员去抄 SUB-1 铭牌上的真实母线额定(如 100A bus:60+40=100 ≤ 125 ✓)。默认保守、录真值转绿,正是该字段存在的意义。

#### 3.2.5 位置检查与固定提示文字(不做假自动判定)

Opposite-end 接入位置、"不得移位"永久标签、14-414 多电源警示标签——图内槽位语义不足以可靠自动判定(main-lug 盘、底部进线盘、feeder 在 sub 内无实体表示),**只做数值校验,位置合规交给电工**,以固定文字呈现:

- `.stage` 底部既有 `.hint`(jsx:465)扩为两行,追加(仅当任意盘含 solar 时渲染第二行):
  > "64-112 附带条件(电工现场核实):① PV breaker 须位于母线远离主进线的一端,且贴永久'不得移位'标签;② 多电源盘按 14-414 设'断开全部隔离开关方可断电'警示;③ PV 位于 subpanel 时,上游主面板母线是否同样需按 64-112 复核(feeder 视为电源侧 OCPD)由电工判定;④ line-side tap 不占母线余量、不在本核算范围——line-side 接入请勿在图内放置 Solar breaker。"
- jsx:419 tip 相应改写:删"并网母线校验(120% 规则)不在本工具范围",改为"盘内放入 Solar breaker 后自动按 64-112(4)(c)(d) 做 125% 母线核算(住宅);busbar 额定请照铭牌填写,不填时按主开关/feeder 额定保守取值"。

**上游级联(PV 在 sub 时主面板母线的数值化核算)本期不做**:权威输入把求和定义为"main breaker + 光伏 breaker";把 feeder 当电源侧 OCPD 计入上游求和时**取 feeder 额定还是逆变器输出电流的 125%**,输入未覆盖,不猜(§8 Q1)。以 ③ 提示文字兜底。

> **Review 已用 Kuo 的 §8 Q1 追加要求改写为下方 `## Review` 中给出的最终 4 条文案(把"line-side tap 判断"提到最前作为新①,原①②③顺延为②③④)——本节草案的 4 条文字保留作为被追加要求覆盖前的版本存档,不再是执行依据,以 `## Review` 的文案为准。**

### 3.3 STANDATA 24-ECB-008 合规核实(逐行结论:**合规**,ADR-007)

- `cecLoad.js:57-62`:五个折减项 `basic / heatAC / rangeDem / whDem / otherDem` 的计算**均不含 evW**——`heatDemand`(16-18)、`rangeDemand`(22-25)、`otherDemand`(30-34)的入参分别只有 heatW/rangeW/otherW;`Math.max(heatDemand(heatW), acW)`(59)的取大也与 evW 无关。EV 负荷不参与任何 derating 步骤 ✓。
- `cecLoad.js:63`:`total = basic + heatAC + rangeDem + whDem + otherDem + evW` — EV 在**最后一步以 100% 直加**,无系数 ✓。
- `LoadCalc.jsx:266-267`:evW = 主面板 + 所有 subpanel 的 EV 断路器 `amp × 240` 之和,进入 computeLoad 前后都无折减 ✓。
- **一个非问题的备注**:evW 按**断路器额定**而非 EVSE 铭牌计(30A breaker 计 7.2kW,而其铭牌连续负载通常 24A=5.76kW)。断路器额定 ≥ 铭牌 → 只会**高估**,方向保守,不违反 STANDATA(其要求是不被稀释、足额选型)。保持现状,不加铭牌输入(YAGNI)。
- 顺手一处文案增强(与 Kuo 输入的报批实操对齐):jsx:553 verdict 超标分支小字追加"EVEMS 设备须 ULC-ORD-3141 认证或在 City of Calgary accepted models list 上(不在名单可邮件 electricaltac@calgary.ca 评审)"。一行字符串改动。

### 3.4 勘察 SOP 检查清单 → **超出本轮范围,建议单独立项**

事实依据:`Survey` 模型(models.py:156-180)只有排期握手/定金/notes/photos,无结构化 checklist——加"有无光伏/光伏位置(主盘或 subpanel)/64-112 是否核算/接入方式(load-side 或 line-side)"字段需要 Alembic 迁移 + schema + admin Surveys 页表单 + 可能的客户提交表单联动,是独立的后端+前端工程,与本轮纯前端改动不同轨。**本轮不动。** 缓解:本轮完成后,Load Calc 打印件已自带 PV 位置(图上红色断路器)+ 64-112 核算结论行,勘察 SOP 的第 2/3/4 条在打印件层面已有落点;立项时只剩接入方式确认与流程性勾选项。

### 3.5 selfcheck 追加(cecLoad.selfcheck.mjs)

```js
// 64-112(4)(c)&(d) dwelling table (authoritative input 2026-07):
// busbar/main → PV max: 100/100→25, 125/100→56.25, 200/200→50, 225/200→81.25
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 0 }).maxPv, 25)
assert.equal(busbarCheck({ busbar: 125, mainOcpd: 100, solarA: 0 }).maxPv, 56.25)
assert.equal(busbarCheck({ busbar: 200, mainOcpd: 200, solarA: 0 }).maxPv, 50)
assert.equal(busbarCheck({ busbar: 225, mainOcpd: 200, solarA: 0 }).maxPv, 81.25)
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 25 }).ok, true)   // exactly at limit
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 100, solarA: 30 }).ok, false)
assert.equal(busbarCheck({ busbar: 60, mainOcpd: 60, solarA: 40 }).ok, false)    // FFT-2026-0002 SUB-1, busbar unknown → conservative fail
assert.equal(busbarCheck({ busbar: 100, mainOcpd: 60, solarA: 40 }).ok, true)    // same panel with real 100A bus
assert.equal(busbarCheck({ busbar: 0, mainOcpd: 100, solarA: 20 }), null)        // insufficient data → no verdict
assert.equal(solarAmpsOf([{ kind: 'solar', circuits: [{ amp: 20 }] }, { kind: 'solar', circuits: [{ amp: 20 }] }, { kind: 'normal', circuits: [{ amp: 40 }] }]), 40)
// STANDATA 24-ECB-008: evW must not be diluted by any demand factor — delta of totals with/without EV === full evW
const noEv = computeLoad({ area: 200, heat: 15, ac: 5, range: 12, wh: 5, other: 6, heatType: 'electric', main: '100 A', evW: 0 })
const withEv = computeLoad({ area: 200, heat: 15, ac: 5, range: 12, wh: 5, other: 6, heatType: 'electric', main: '100 A', evW: 11520 })
assert.equal(withEv.total - noEv.total, 11520)
```

### 3.6 涉及文件清单

| 文件 | 改动 |
|---|---|
| `admin/src/utils/cecLoad.js` | 新增 `busbarCheck` + `solarAmpsOf`;`connectedAmps` 注释改写(代码不动) |
| `admin/src/pages/LoadCalc.jsx` | 顶层 `busbar` state + cfg 输入;subpanel `busbar` 字段 + subctl 输入 + `setSubBusbar`;`render64112` 状态行(main + 每个 substage,`.subctl` 之外);oload 判定删除→info 行;`.hint` 附带条件文字;tip/verdict 文案;CSS(`.oload.info`、`.code64.ok/.bad/.fixpath`,删 `.oload.ok/.bad`);save/load 带 busbar 字段(load 时 `v.busbar ?? null`、`s.busbar ?? null`) |
| `admin/src/utils/cecLoad.selfcheck.mjs` | §3.5 断言 |

后端零改动;JSONB 契约向后兼容(旧档无 busbar → null → 跟随行为)。

## 4. Rejected (cheaper) alternatives

- **删需求(rung 1)**:64-112 校验上一轮因系数未核实被搁置;本轮有权威条款号 + 生产案例(PV 在 SUB-1)真实命中,必须做。误报"超载!"直接误导电气判断,必须撤。
- **复用(rung 2)**:`connectedAmps` 无法复用为 64-112 校验——上一轮 §6.2 Q3 已论证被加数(负载开关)与被比数(feeder)全错;64-112 求和的是电源侧 OCPD 对母线额定,必须新函数。
- **只改数据/配置(rung 4)**:没有任何配置能把"断路器额定相加"变成合法判定;busbar 是新维度数据,必须新字段。
- **demand 版 feeder 校验(选项 b)**:数据不足,做出来是伪权威错数,否决(ADR-005,详见 §3.1)。
- **完全删掉额定合计(选项 a)**:数字本身对照实物核对录入有真实价值且保留成本为零;降级为 info 而非删除(Kuo 可翻案,§8 Q2)。
- **上游级联数值核算**:计入基准(feeder 额定 vs 逆变器输出×125%)未被权威输入覆盖,不猜;文字提示兜底(§8 Q1)。
- **busbar"创建时复制默认值"**:引入 main/feeder 改动后的联动脏标记问题;`null=跟随` 更简单且语义更准。

## 5. Components & data contracts

- **load_calc JSONB**:顶层 + `busbar: number|null`(null/缺失 = 跟随 main breaker);subpanel + `busbar: number|null`(null/缺失 = 跟随 feederAmp)。其余形状不变。旧档照常读,旧版前端读新档忽略未知字段——双向兼容。
- **busbarCheck({busbar, mainOcpd, solarA}) → {sum, limit, maxPv, ok} | null**:纯函数,dwelling 125% 内联;数据不足返回 null(不渲染,绝不输出假判定)。
- **solarAmpsOf(units) → number**:盘内 PV 回馈断路器额定合计。
- **connectedAmps**:签名/行为不变;语义重新定位为"panel-schedule 核对合计",UI 不再据此判定任何事。
- **后端**:GET/PUT `/cases/{id}/load-calc` opaque JSONB,无契约变更。

## 6. Risks & red lines

- **信任边界校验**:busbar 输入守卫(空→null、NaN/≤0 忽略、15-800);既有 feeder/slots 守卫不动;React 转义渲染,无注入面;仅管理员页面(RequireAuth 后)。
- **数据丢失**:全部改动非破坏性;busbar 字段增量写入,save 失败已有 toast;删除 oload 判定不删任何数据。
- **安全**:无密钥、无新依赖、无新 API 面。
- **可访问性**:busbar 输入在真 `<label>` 内;64-112 状态行 ✓/✗ 符号 + 全数字文本,非纯颜色语义;info pill 中性灰不冒充检查结果;不新增拖拽面。
- **电气正确性(本任务真正的红线)**:
  - 125% 仅住宅——本工具是 8-200 单户计算器,常量内联并注释,不越界用于非住宅。
  - 数据不足时 `busbarCheck` 返回 null 而非猜测;位置合规**绝不**自动判定,固定文字交电工(Kuo 明示要求)。
  - 撤"超载!"不撤任何真实保护:它从未构成有效校验(§3.1);真实保护 = 8-200 service 计算(不动)+ 本轮新增的 64-112 核算。
  - PV 永不抵扣 calc.amps(ADR-003,本轮零触碰,`computeLoad` 签名不变)。
- **实施风险**:SUB-1 默认 ✗ 是预期行为不是 bug(§3.2.4 已声明,tester 用例照此写);64-112 行在打印件的排版需 tester 打印预览验证(A4 横向,`break-inside:avoid` 是否需要把 `.code64` 和面板包为一体——若被分页,把 `.code64` 移进 `.substage` 的 avoid 范围即可,已在 avoid 范围内的 substage 无此问题,主面板的行需实测);上轮教训(MEMORY 2026-07-24):UI 改动部署前必须真实浏览器交互一遍,不能只信 tester 静态检查。

## 7. ADRs recorded

已入库(codebase-memory ADR store,项目 `F-claude-vs-projects-fft-evquote-helper`;含补录的上一轮 ADR-003/004):
- **ADR-005**:断路器额定相加不构成过载判定;降级为中性信息;数据不足不做伪 demand 校验。
- **ADR-006**:实现 64-112(4)(c)&(d) 住宅 125% 母线核算;busbar 字段 null=跟随;仅数值校验,位置/标签为固定提示文字;适用于任何物理装有 Solar breaker 的盘;line-side tap 不入图。
- **ADR-007**:EV 负荷处理符合 STANDATA 24-ECB-008(免折减、末步 100% 直加);按断路器额定计为有意保守。
- **ADR-008**:工具有意不提供 8-106(8) 实测需求路径(光伏住宅净计量数据系统性低估电网侧峰值)。

## 8. Open questions for Kuo

1. **上游级联**:PV 在 subpanel 时,主面板母线的 64-112 是否也要数值化核算?若要,计入上游求和的基准请从业者确认:feeder 断路器额定,还是逆变器输出电流 × 125%?(默认:本期只做文字提示 ③,数值级联待确认后加——纯函数已就位,加一次调用即可。)
2. **断路器额定合计行**:按 ADR-005 保留为中性信息行(默认),还是彻底删除?
3. **SUB-2 实际构成**:请提供 SUB-2 各回路的器具与瓦数,以人工核定其 60A feeder 是否够(工具按设计不判此项)。
4. **勘察 checklist 单独立项**:§3.4 结论确认后,是否要我下轮出 Survey 表单扩展(迁移+schema+admin UI)的独立设计?
5. **verdict EVEMS 文案增强**(§3.3 末条,ULC-ORD-3141/accepted list 一行字)默认包含,如嫌长可去。

---

## Review

**Reviewer verdict: no BLOCKER. Design approved with Kuo's §8 answers folded in (Q1 carries an additional Kuo-authored requirement beyond the architect's default). STEPS.md written accordingly.**

### Kuo's §8 answers actually used

1. **Q1 — architect default ("文字提示,不数值化上游级联") accepted, PLUS a Kuo-authored addition to the §3.2.5 hint text.** Kuo's reasoning: whether the existing PV interconnection is a **load-side backfeed** (through a breaker, feeds the busbar, subject to 64-112) or a **line-side tap** (ahead of the meter/service disconnect, occupies zero busbar headroom at *any* layer — neither the panel it's "in" nor any upstream panel) is a judgment call the electrician needs to make *before* anything else in the list, and it's more commonly relevant on site than the upstream-cascade question itself. The architect's draft already contained this idea as item ④ (last, load-side-implied framing), but buried at the end. Kuo asked for it moved to the front (or added as an explicit new item, renumbering the rest — Kuo's phrasing permits either).
   **Reviewer's implementation choice: merge, not append.** Old item ④'s content ("line-side tap 不占母线余量、不在本核算范围——line-side 接入请勿在图内放置 Solar breaker") is fully absorbed into the new front item ①, expanded into an explicit "确认 backfeed 类型" instruction; old ①②③ are renumbered ②③④ with no other change. This was chosen over appending a 5th bullet to avoid saying the line-side-tap point twice in the same hint (DRY) — flagging explicitly here so Kuo can override to a 5-item list if a literal front-insert was intended instead.
   **Finalized §3.2.5 hint text (authoritative, supersedes the draft 4-item text under §3.2.5 above; this exact string is what STEPS.md's step wires in):**
   > "64-112 附带条件(电工现场核实):① 先确认现有 PV 是 load-side backfeed(经断路器接入母线,需按 64-112 核算)还是 line-side tap(计量表前/进线侧接入,不占用任何一层母线余量,不在本核算范围——line-side 接入请勿在图内放置 Solar breaker,以下②-④ 均不适用);② PV breaker 须位于母线远离主进线的一端,且贴永久"不得移位"标签;③ 多电源盘按 14-414 设"断开全部隔离开关方可断电"警示;④ PV 位于 subpanel 时,上游主面板母线是否同样需按 64-112 复核(feeder 视为电源侧 OCPD)由电工判定。"
   Numerical upstream cascade itself remains **not implemented** this round, per the architect default Kuo confirmed — only the hint text changes.
2. **Q2 — confirmed as architect default.** Connected-breaker-total row stays as a neutral info pill (not deleted). Executed per §3.1 exactly: `const oload` judgment removed, span becomes `断路器额定合计 {camps}A · 非负荷计算,仅供与实物面板核对`, CSS `.oload.ok/.bad` replaced by a single neutral `.oload.info`, and the `cecLoad.js` comment above `connectedAmps` is rewritten to state plainly that it is not an overload/feeder-adequacy test.
3. **Q3 — no code action.** SUB-2 circuit-by-circuit wattage is Kuo's own manual review; not represented in STEPS.md.
4. **Q4 — confirmed as architect default.** Survey checklist stays out of scope this round; §3.4's conclusion stands unchanged; STEPS.md contains zero backend/model/migration steps.
5. **Q5 — confirmed as architect default (include the EVEMS sentence).** One string append to the verdict's over-branch small text, per §3.3's last bullet, verbatim.

### Over-design deletion list (YAGNI ladder applied as critic)

**Nothing to cut.** Walking every new element in §3:
- `busbarCheck` and `solarAmpsOf` (§3.2.1): two small pure functions, no interface/factory/config wrapper, no non-dwelling branch (125% is inlined and commented, not parameterized for a case that will never occur in this tool) — this is rung 6 (minimum new code), correctly not rung 7 (a general "electrical code rule engine" abstraction nobody asked for).
- `busbar` field, both levels (§3.2.2): required data, not speculative — 64-112 cannot be checked without a busbar rating that's independent of the main/feeder OCPD rating (225A bus on a 200A main is a normal real panel). "null = follow" over "copy on create" is itself the cheaper of two options and was chosen for exactly that reason (§4) — YAGNI already applied by the architect, holding on review.
- `render64112` as a shared helper (§3.2.4): used twice (main + every subpanel); a helper avoiding duplicated JSX/logic at two call sites is not premature abstraction, it's the DRY floor. It returns `null` (renders nothing) in the two cases where showing it would be either noise (no solar on this panel) or a fabricated verdict (insufficient data) — no speculative "what if we need three states" branching was added beyond what §3.2.4 already specifies.
- The `.code64`/`.oload.info` CSS additions reuse existing design tokens (`--accent-d`, `--accent-bg`, `--rose`, `--red-bg`, `--ink3`, `--app`, `--line2`) verbatim — no new color values invented, no new visual language introduced beyond what the existing `.hint`/`.subctl .oload` classes already established.
- STANDATA verdict text (§3.3) and the two §3.2.5 hint lines are one-line/one-block string edits — nothing to simplify further; they exist because they're real compliance-facing text a licensed electrician or the city reviewer needs, not decoration.
- Upstream cascade (Q1 default) and the optional numeric PV-vs-busbar warning variants were correctly left unbuilt rather than speculatively scaffolded "for later" — consistent with §4's own reasoning.

### Red-line check (never cut, verified intact)

- **Trust-boundary validation**: both new `busbar` inputs (main + subpanel) follow the exact same guard pattern as the existing `feeder`/`slots` inputs — empty string → `null` (follow), non-finite or ≤0 → silently ignored (previous committed value retained), range hinted via `min`/`max`/`step` HTML attributes (same "soft" enforcement style the codebase already uses for `feeder`, not a new, stricter pattern invented just for this field). No new trust boundary crossed — still admin-only, `RequireAuth`-gated, React-escaped rendering, no new API surface.
- **Data loss**: every change is additive/non-destructive. Removing the `oload` boolean and its judgment deletes a *display decision*, not stored data — `camps` (the underlying number) is still computed and shown, just without the false-positive verdict layered on top. `busbar` is a new optional field written alongside existing fields in `save()`; omission on old records defaults to `null` (follow), never crashes, never silently drops other fields.
- **Security**: no secrets, no new dependency, no new backend endpoint — confirmed backend stays untouched (`load_calc` JSONB is opaque server-side, per §3.6 / §5).
- **Accessibility**: new `busbar` inputs sit inside real `<label>` elements (matching existing `Feeder`/`Slots` pattern). The `.code64` status line uses `✓`/`✗` glyphs *and* full numeric text — never color alone — satisfying the same non-color-only bar the existing `.oload` pill and `.verdict` card already meet. No new drag/keyboard-trap surface introduced.
- **Electrical correctness (this task's real red line)**:
  - 125% stays dwelling-only, inlined and commented — no code path exists that would apply it to a non-residential scenario, and none was added to accommodate one.
  - `busbarCheck` returns `null` on insufficient data (`busbar` or `mainOcpd` not `> 0`) — the render helper treats `null` as "show nothing," never as "assume ok" or "assume not ok." No guessing.
  - Position/label compliance (busbar-end placement, permanent labels, 14-414 warning signage, upstream-cascade judgment, load-side-vs-line-side determination) is **100% static text**, never a computed verdict — confirmed no JS branch exists anywhere that infers panel position or wiring topology from slot/column data. This matches Kuo's explicit instruction and the architect's own §3.2.5 design intent.
  - `computeLoad`'s signature and body are untouched by this round (verified against the actual current `cecLoad.js` read during this review) — PV continues to never offset `calc.amps`, independent of whatever `busbarCheck`/`render64112` display.
  - The FFT-2026-0002 SUB-1 default-✗ behavior (busbar unset → follows feeder 60A → 60+40=100 > 75) is explicitly preserved as *correct*, not treated as a defect to "fix" — carried into STEPS.md's Test plan as a named assertion, per §3.2.4's own "预期行为声明."

### One process note (non-blocking)

§3.2.4's pseudocode calls `solarAmpsOf(units)` twice (once inside the `busbarCheck` call, once in the display line) and separately notes "实现时把 solarAmpsOf 结果存局部变量,勿调两次" — STEPS.md's step for `render64112` computes `solarA` once into a local `const` and reuses it in both places, consistent with that note. No design change, just confirming the implementation-detail instruction survived translation into an atomic step.

**No BLOCKER. Proceeding to STEPS.md.**

---
---

# ARCHIVE — Round 1(已批准并实现,commit 10b97d9/e2a3bd7;以下为历史存档,非当前执行依据)

# DESIGN: Load Calculator 五项 UI 修复 + CEC 8-200 算法专业审查 + Solar PV 处理修正

## 0. Task tier & Skill Manifest(存档)
- Tier: **STANDARD** — 多文件(LoadCalc.jsx + cecLoad.js + selfcheck),含电气规范正确性判断;无 schema/API 变更(load_calc JSONB 后端不解析,契约向后兼容扩展)。
- Skills: `cmm`, `codebase-memory`, `ponytail-review`(MANDATORY-INFRA);`ui-ux-pro-max`(UI 权威,已咨询并折入);无后端/DB/部署技能需要。
- Planned advisor consults: **1**(完工 sign-off)。

---

## 1. Goal

修复生产案例 FFT-2026-0002 实测复现的 5 个 Load Calculator UI/功能问题;对 `cecLoad.js` 的 CEC 8-200 算法逐条核对并给出置信度;修正 Solar PV 被错误计入 subpanel"连接负荷/超载"警告的问题,并明确 PV 与负荷计算的正确关系(含 120% 母线规则的去留结论)。

## 2. Current real flow

（依据 2026-07-23 cmm 报告 + 本次全文精读,非记忆推断）

- **页面**:`admin/src/pages/LoadCalc.jsx`(715 行,含 530-715 行 scoped CSS 字符串),路由 `/admin/cases/:id/load-calc`(App.jsx:146),入口 CaseDetail.jsx:592。
- **纯函数**:`admin/src/utils/cecLoad.js`(67 行):`basicLoad / heatDemand / rangeDemand / otherDemand / connectedAmps / computeLoad`。自检 `admin/src/utils/cecLoad.selfcheck.mjs`(`node` 直接跑,assert 全绿)。
- **持久化**:`case.load_calc` JSONB;后端 `backend/app/api/v1/admin/cases.py:48-77` 只做 opaque 存取(`case.load_calc = payload.value`),**不解析结构**——前端是数据形状唯一消费方,扩字段无需迁移。
- **数据形状**:`{ brand, main, slots, units[], subEnabled, subpanels[{id,name,feederAmp,slots,units}], calc{...} }`;unit = `{id,type,col,row,kind,circuits[{label,amp,pole}],subId?}`。
- **布局链**(决定 bug 1/4 的修法):AdminShell 侧栏 `w-64`=256px(lg:static);真正滚动容器是 `<main class="flex-1 overflow-y-auto p-4 lg:p-6">`(**不是 window**,sticky 参照它);页面内 `.lc .wrap{max-width:1280px;padding:22px}` → `.lc .grid{grid-template-columns:230px 1fr 320px;gap:18px;align-items:start}`(568 行),`@media(max-width:1100px)` 变单列(569 行)。
- **放置引擎**:`SPAN()`(18)、`occupiedAt`(135-136,只查 `row` 与 `SPAN===2 && row+1`)、`place`(138-147)、`moveUnit`(150-156)、`keepFitting`(173-180)、`firstFreeDouble`(194-201)——全部硬编码"最大跨 2 槽"。
- **Solar 现状**:`computeLoad` 不收任何 PV 参数(calc.amps 与 PV 无关,正确);`connectedAmps`(cecLoad.js:39-44)只排除 `kind==='feeder'`,**未排除 solar** → SUB-1 两个 20A PV 断路器被计入"连接负荷"触发虚假"超载!"(实测 125A/60A)。

## 3. Chosen solution

**YAGNI rung:Bug 1-4 与 Solar 修正 = 第 5 级(对现有代码最小改动);Bug 5 = 第 6 级(最小新代码)** —— 4 槽 breaker 若只改数据不改逻辑(第 4 级)会产生重叠放置 bug,必须泛化放置校验;泛化收敛为一个 `fitsAt()` 助手,零臆测抽象。更便宜的台阶为何不行见 §4。

### 3.1 Bug 1 — Breakers 调色板吸顶(纯 CSS,2 条规则)

在 CSS 字符串新增(568-574 行附近):

```css
@media(min-width:1101px){
  .lc .grid>.col:first-child{position:sticky;top:0;max-height:calc(100vh - 72px);overflow-y:auto}
}
```

- 生效前提已满足:`.grid` 是 `align-items:start`(568 行),sticky 元素与滚动容器(AdminShell `<main>`,顶栏 56px)之间无 overflow 祖先。`72px ≈ 56px 顶栏 + 16px 呼吸`,实现时以浏览器实测微调。
- 单列断点内不 sticky(整列吸顶会吃掉小屏视口),故包在 min-width 媒体查询里;媒体查询阈值与 §3.4 断点校正联动(若断点改 1360,此处相应改 `min-width:1361px`)。
- 右侧 Service load 列用户未报,不动(如要,同一条选择器加 `:last-child` 即可,留待反馈)。

### 3.2 Bug 2 — Subpanel 改名(prompt 交互,与 editCircuit 同模式)

新增 `renameSubpanel(sid)`(放 removeSubpanel 附近,~229 行):

```js
function renameSubpanel(sid) {
  const sp = subpanels.find((s) => s.id === sid); if (!sp) return
  const raw = window.prompt('Subpanel 名称:', sp.name); if (raw === null) return
  const name = raw.trim().slice(0, 24) || sp.name
  setSubpanels((ps) => ps.map((s) => (s.id === sid ? { ...s, name } : s)))
  // 主面板 feeder 的 '→ SUB-n' 标签必须跟着改(addSubpanel:224 生成时绑定了旧名)
  setUnits((p) => p.map((u) => (u.kind === 'feeder' && u.subId === sid)
    ? { ...u, circuits: [{ ...u.circuits[0], label: '→ ' + name }] } : u))
}
```

- 入口:`.subctl`(415-426 行)里加一个**真按钮** `<button aria-label="重命名 subpanel">✎ 改名</button>`(样式仿 `.rmsub` 做中性变体)。ui-ux-pro-max:改名入口必须是 button 才键盘可达 + 可见 focus + cursor-pointer;面板深色头部的 `{sp.name}` 文本不做点击入口。
- 选 prompt 而非 inline 编辑:与既有 `editCircuit()`(160-171 行)交互一致,零新 UI 机制;若 Kuo 偏好 inline 见 §8 Q3。
- 校验:trim、空值/取消回退旧名、截断 24 字符(面板头部排版上限);React 渲染自动转义,无 XSS 面。

> **Review 已用 Kuo 的 §8 Q3 拍板改写为 inline 编辑框方案,见下方 `## Review` 与 `STEPS.md`——本节 prompt 版本保留作为被否决方案存档,不再是执行依据。**

### 3.3 Bug 3 — Feeder 额定改自由数字输入 + 预设 datalist

替换 417-419 行的 `<select>`:

```jsx
<input type="number" min="15" max="400" step="5" list="feederPresets" value={sp.feederAmp}
  onChange={(e) => { const n = parseInt(e.target.value, 10)
    if (Number.isFinite(n) && n > 0) setSubFeeder(sp.id, n) }} />
```

`<datalist id="feederPresets">`(渲染一次,放 map 外)由现有 `FEEDER_AMPS=[40,60,100,125]`(19 行)生成,常用值仍一键可选,任意值(如 50)可录。
- `setSubFeeder`(234-238)已接受任意数字,**不用改**;主面板 feeder 视觉(renderUnit 261-271)直接渲染 `{c.amp}A`,**不用改**;"连接负荷/feeder"比较用 `sp.feederAmp`,任意值天然成立。
- NaN/≤0 守卫跳过提交(输入中间态不破坏 state),行为与旁边 Slots 输入(421-423)一致。

### 3.4 Bug 4 — 主面板溢出 + 右缘拥挤

**溢出根因已用实数验证(用户假设成立)**:grid 中间 `1fr` 轨道默认 `min-width:auto`,最小内容宽 = panel 392 + `.stage` 左右 padding 28 = **420px**;三栏最小合计 230+420+320+36(gap) = 1006px,加 `.wrap` padding 44 = 1050px;再加侧栏 256 + `<main>` padding 48 → **视口需 ≥ ~1354px**。而单列断点在 1100px——**1100~1354px 视口(1280×800、1366×768 笔记本全中招,浏览器放大同理)三栏必溢出**,且 `<main>` 的 `overflow-y:auto` 使 overflow-x 计算为 auto,表现为横向滚动/右栏被裁,即用户看到的"溢出"。

修复(全部在 CSS 字符串):
1. **防撑爆保险**:`.lc .grid{grid-template-columns:230px minmax(0,1fr) 320px}`(568 行)+ 新增 `.lc .stage{overflow-x:auto}` —— 任何情况下面板列内部滚动,绝不再撑破页面(ui-ux-pro-max 的 minmax(0,1fr) blowout 标准模式)。
2. **断点校正**:单列断点 `max-width:1100px` → **`max-width:1360px`**(569 行)——三栏只在真放得下时出现(1366 视口:可用轨道宽 1018,需 230+320+36+中列 428 = 1014 ✓,按下条新尺寸)。代价:1101~1360px 从"溢出的三栏"变"正常的单列",纯改善。备选方案见 §8 Q4。
3. **面板呼吸**:`.lc .panel{width:392px;padding:16px 32px}`(595 行)→ `width:400px;padding:16px 36px`——内容宽 328px 不变(槽位宽 149px 不缩),槽号(611-612 行,±23px 定位)到面板边缘的缝隙 9px → 13px;`.lc .panel.sub{width:360px}`(596 行)→ `368px`,`.lc .subctl{width:360px}`(655 行)→ `368px` 同步。打印布局复核:A4 横向可打印 ≈1047px,400+368+22 gap = 790 ✓ 不受影响。
4. 实现后 tester 在 1366×768 与 1280×800 实际截图验收(含开 2 个 subpanel 的长页)。

### 3.5 Bug 5 — 新增 2-Pole 120V + 4 槽 breaker,放置引擎泛化任意 span(ADR-004)

**引擎泛化**(先做,否则新类型必产生重叠 bug):

```js
// 统一校验:span 内每格都存在且空闲
function fitsAt(pid, type, col, row, exceptId) {
  const s = SPAN(type)
  for (let k = 0; k < s; k++) {
    if (!slotExists(pid, col, row + k) || occupiedAt(pid, col, row + k, exceptId)) return false
  }
  return true
}
```

- `occupiedAt`(135-136)泛化为区间:`u.col === col && row >= u.row && row < u.row + SPAN(u.type)`。
- `place`(141-142 两个 if)→ `if (!fitsAt(pid, type, col, row)) return`。
- `moveUnit`(153-154)→ `if (!fitsAt(pid, u.type, col, row, uid)) return`。
- `keepFitting`(177 行)→ `if (slotNumber(u.col, u.row + SPAN(u.type) - 1) > n) return false`。
- `firstFreeDouble`(194-201)内部改走 `fitsAt(pid, 'feeder', col, row)`(语义不变)。
- `buildSlotList` 与 renderPanel 的 topUnit/occ 逻辑经泛化后的 occupiedAt 自动正确,不另改。
- **渲染高度**:`.unit.tall` 固定 67px(617 行,=2×30+7 gap)只对 span2 成立;renderUnit 改为 span>1 时 `className` 含 `tall` 且加内联 `style={{height: sp*30 + (sp-1)*7}}`(slot 高 30、行 gap 7,见 608/609 行)→ span4 = 141px。

**新类型**(TYPES 8-17 行 + PALETTE 21-28 行 + 调色板 glyph CSS 变体):

```js
p2_120: { slots: 2, kind: 'normal', mk: () => [{ label: '', amp: 20, pole: 2, volt: 120 }] },
quad4:  { slots: 4, kind: 'normal', mk: () => [{ label: '', amp: 30, pole: 2 }, { label: '', amp: 30, pole: 2 }] }, // 组成待 Kuo 确认(§8 Q2)
```

- circuits 增可选 `volt`(缺省 240):288 行显示改 `{c.amp}A{c.pole === 2 ? '·' + (c.volt || 240) + 'V' : ''}`;281 行 `v240` 琥珀色 toggle 判定改 `c.pole === 2 && (c.volt || 240) === 240`(120V 双极保持绿色)。旧存档无 volt → 显示行为逐位不变,**JSONB 向后兼容,无迁移**。
- 两个新类型 kind 均 'normal',不进 `computeLoad`(只有 kind==='ev' 参与负荷)——负荷算法零影响。
- 默认 amp/标签/glyph 样式按 §8 Q1/Q2 的答案定稿;引擎泛化部分不被这两个问题阻塞。

> **Review 已用 Kuo 的 §8 Q1/Q2 拍板改写为"p2_120 = pole:1 单路 120V 占 2 槽物理空间"+"quad4 = 单台老式大框架 2-Pole,占 4 槽,单路 240V"**,与本节草案的 handle-tie/双 2-Pole 叠放假设不同,详见 `## Review` 与 `STEPS.md`——本节 TYPES 代码块与 volt 显示公式保留作为被否决方案存档,不再是执行依据。

### 3.6 Solar PV 修正(ADR-003;专业结论全文见 §6.2)

1. **`connectedAmps` 排除 solar**(cecLoad.js:41,与 feeder 排除同款一行):

```js
if (u.kind === 'feeder' || u.kind === 'solar') return sum
```

同步更新该函数上方 ponytail 注释("PV 是电源不是负载,不计入连接负荷")。SUB-1 即刻从 125A → 85A,虚假"超载!"消失。
2. **`computeLoad` 保持与 PV 完全无关**(现状正确,不动);394 行提示文案追加半句:"Solar 为发电源,不抵扣 8-200 计算负荷;并网母线校验(120% 规则)不在本工具范围,由电工在图纸阶段确认。"
3. **120% 母线规则暂不实现**(理由与前置条件见 §6.2 与 §8 Q5)。
4. `cecLoad.selfcheck.mjs` 追加断言:`connectedAmps` 对 solar/feeder/普通负载混合 units 只计负载;并保留一条 SUB-1 场景回归样例(2×20A solar + 若干负载,不再超 60A)。

> **Review 注:第 1 点"125A → 85A,虚假超载消失"的数值结论有误——见 `## Review` 第 3 条,不改变修复本身的正确性。**

### 3.7 涉及文件清单

| 文件 | 改动 |
|---|---|
| `admin/src/pages/LoadCalc.jsx` | Bug 1(CSS)、Bug 2(renameSubpanel + 按钮)、Bug 3(input+datalist)、Bug 4(CSS 三处)、Bug 5(TYPES/PALETTE/fitsAt/occupiedAt/place/moveUnit/keepFitting/firstFreeDouble/renderUnit 高度与 volt 显示/glyph CSS)、Solar 提示文案(394 行) |
| `admin/src/utils/cecLoad.js` | `connectedAmps` 排除 solar(一行)+ 注释 |
| `admin/src/utils/cecLoad.selfcheck.mjs` | connectedAmps 断言 + solar 回归样例 |

后端零改动;`case.load_calc` 契约向后兼容(新档多 `volt` 字段,旧档照常读)。

## 4. Rejected (cheaper) alternatives

- **删需求(rung 1)**:5 个 bug 均生产实测复现,虚假"超载!"警告直接误导电气判断,必须修。
- **复用/库/平台(rung 2-3)**:sticky、minmax、datalist 全是平台原生能力——已用满,这正是选中的方案;不引入任何新依赖(无拖拽库、无弹窗库)。
- **只改数据不改代码(rung 4)**:对 Bug 5 推演过——只加 `slots:4` 条目而 `place()` 只查 row+1,4 槽 breaker 会与下方 unit 重叠、越过面板底、moveUnit 撞档,属带病上线;否决(ADR-004)。
- **Bug 2 用 inline 编辑框**:要新增编辑态 state、blur/Enter 提交、Esc 逃逸——比照抄 editCircuit 的 prompt 模式贵数倍,收益仅是好看一点;默认否决,留 §8 Q3 给 Kuo 翻案。**(Kuo 已翻案,见 `## Review`)**
- **Bug 4 只加 `minmax(0,1fr)` 不动断点**:1100~1360px 区间会变成"三栏但面板列内横向滚动",可用但别扭;断点校正只是一行,一起做(备选保留在 §8 Q4)。
- **立即实现 120% 母线规则**:系数与条款号未经持证电工按 Alberta 现行 CEC 版本核实,发布错误数字比不发布更危险;否决,转待确认后续项(ADR-003)。

## 5. Components & data contracts

- **unit**:`{ id, type, col:'L'|'R', row, kind:'normal'|'ev'|'solar'|'feeder', circuits[], subId? }` — 不变。
- **circuit**:`{ label, amp, pole }` → `{ label, amp, pole, volt? }`(volt 缺省 240;仅显示层消费)。
- **subpanel**:`{ id, name, feederAmp, slots, units }` — 形状不变;`name` 变为可编辑(≤24 字符,非空);`feederAmp` 值域从枚举 {40,60,100,125} 放开为 15–400 整数。
- **TYPES**:每条 `{ slots(1|2|4), kind, mk() }`;`fitsAt()` 是放置合法性唯一裁判(place/moveUnit/firstFreeDouble 全走它)。
- **connectedAmps(units)**:语义收紧为"负载类断路器额定之和"(排除 feeder + solar),仅用于 subpanel 超配提示,非 8-200 正式计算——注释同步。
- **后端**:GET/PUT `/cases/{id}/load-calc` opaque JSONB,无契约变更。

## 6. Risks & red lines

### 6.1 CEC 8-200 算法逐条核对结论

对照 CEC Part I Section 8(2018/2021 版条文结构)与 Calgary 官方 worksheet:

| 代码 | 条文 | 结论 | 置信度 |
|---|---|---|---|
| `basicLoad`:首 90㎡ 5000W,之后每 90㎡(不足进位)+1000W | 8-200(1)(a)(i)(ii) | **正确** | 高 |
| `heatDemand`:前 10kW 100% + 余 75% | 8-200(1)(a)(iii) 经 Section 62(62-118 住宅电采暖需求系数) | **正确** | 高 |
| AC 100%、与采暖取大 | (iv) + 8-106(4) 非同时负荷取大 | **正确**(Calgary worksheet 同法) | 高 |
| `rangeDemand`:单台 6000W + 超 12kW 部分 ×40% | (v) | **正确** | 高 |
| `whDem` 100%:即热热水器/泳池/hot tub/spa 加热 | (vi) | **正确**(罐式储水热水器归 (viii),代码分流正确) | 高 |
| EVSE 100% 直加 | (vii)(2018 版新增);EVEMS 豁免 8-106(10)/(11),verdict 文案已引用 | **正确** | 高 |
| `otherDemand`:>1.5kW 其它负荷,有电炉 25%;无电炉首 6kW 100%+余 25% | (viii) | **正确** | 高 |
| `minSvc`:≥80㎡→100A,否则 60A | 8-200(1)(b)(24kW/14.4kW 下限) | **正确** | 高 |
| `amps = total/240` | 单相 240V service | 正确 | 高 |

**两个非 bug 的提示级备注**(不改算法,可选加 UI 提示,见 §8 Q7):
- ① "居住面积"按 8-110 应为地面层+楼上 100% + **地下室按 75%** 计;工具收原始 m²,建议在面积输入旁加一行灰字提示,防止把全地下室面积按 100% 填入。
- ② 8-200(1) 取 (a)(b) **较大者**:代码单独展示 minSvc 注释而没把 calc.amps 向下限取整,当计算值低于下限时显示原始值——对本工具用途(判断现有 service 加 EV 是否够)无害,但打印给审图时宜同时标注"计算负荷不低于 8-200(1)(b) 下限"。

（(iii)~(viii) 的小项编号随 CEC 版本略有位移,以上按条文**内容**对齐,不对编号背书。整体结论:**算法与真实 CEC 8-200 一致,无需修改**;正式随图提交前仍应由持证电工按 Alberta 现行采用版本复核——这是执业要求,不代表对代码存疑。）

### 6.2 Solar PV 专业结论(用户点名三问)

**Q1:PV 是否应抵扣 8-200 计算负荷?——不应,任何情况下都不应。(置信度:高)**
8-200 计算负荷为 service/主开关定容量,依据是**最大需求**,而最大需求必须假设发生在 PV 出力为零的时刻(夜间、积雪、逆变器故障/停机、防孤岛断开)。CEC 没有任何条款允许用自发电抵扣住宅计算负荷;PV 在规范体系里是 Section 64 管辖的**电源**,不是负荷。二者是两个不相关的问题——现行 `computeLoad` 不收 PV 参数是**正确设计**,保持不动。

**Q2:PV 是否应以别的方式进入本工具?——概念上是,正确层面是母线/OCPD 并网校验,但本期不实现。(该规则存在:高置信;确切条款号与系数:中等置信,须持证核实)**
PV 并网真正的校验点是 CEC Section 64 的并网点规则(近版为 **Rule 64-112**,机制与 NEC 705.12 同源):负荷侧并网时,向同一母线供电的过流装置额定之和相对母线额定有上限——业界惯称"120% 母线规则"(主开关 + PV 回馈开关之和 ≤ 母线额定 ×120%,且 PV 开关位于母线远端;另有 100% 规则等替代路径),逆变器输出回路导体/OCPD 按额定输出电流的 ≥125% 取。**这属于设备/母线额定层校验,与 8-200 需求计算是不同层面**,当前代码完全没有这一层。我对"该规则存在于 CEC Section 64、机制与 NEC 705.12 同源"置信度高;但对 Alberta 现行采用的 CEC 版本中**确切条款号、系数(100%/120%)与适用条件**只有中等置信度——**不确定就不发布**:实现前必须由持证电工/工程师按现行版本 + Alberta STANDATA 核实,且需新增"busbar 额定"输入(母线额定 ≠ 主开关额定,如 100A 主开关常配 125A 母线)。故列为待确认后续项(§8 Q5),本期只修文案与错误警告。

**Q3:`connectedAmps` 计入 solar 是错误还是歪打正着?——是错误,且并非歪打正着。(置信度:高)**
- 作为"连接负荷":PV 在负荷方向上只会**抵减**流经 feeder 的电流,永远不会叠加;把 2×20A PV 计成 40A"负荷"等于把电源当负载,直接制造了 SUB-1 的虚假"超载!"(125A/60A,其中 40A 是 PV)。
- 作为母线校验:120% 规则求和的是**向母线供电的 OCPD**(feeder 开关 + PV 开关),比较对象是**母线额定**;`connectedAmps` 求和的是**全部负载开关**,比较对象是 **feeder 额定**——被加数和被比数都不对,不构成任何有效校验,不是歪打正着。
- **修复**:`connectedAmps` 排除 `kind==='solar'`(§3.6);"连接负荷 vs feeder"提示保留其"粗保守超配预警"的原定位(它本来就不是 8-200 计算,注释已声明)。可选加一条物理上站得住的廉价警告:subpanel 内 PV 开关额定之和 > feederAmp 时提示"PV 回馈电流可能超 feeder 额定,需电工核实"(§8 Q6,默认不加)。

### 6.3 红线逐项

- **信任边界校验**:仅管理员页面(RequireAuth 后),仍对所有新输入设守卫——feeder 输入 NaN/≤0 拒提交并限 15–400;改名 trim + 非空回退 + 24 字符截断;React 转义渲染,无注入面;后端 JSONB opaque 不解析,无新攻击面。
- **数据丢失**:改名/feeder/新类型均非破坏性;`keepFitting` 缩槽静默裁剪 breaker 属**既有行为/既有缺口**(本期不扩,记录在案);toggleSub 删 subpanel 已有 confirm;save 失败已有 toast,不静默。
- **安全**:无密钥、无注入、无新依赖。
- **可访问性**:改名入口为真 `<button>` + `aria-label` + 可见 focus + cursor-pointer(键盘可达);feeder 输入在既有 `<label>` 内;色彩沿用既有体系。**既有缺口**:HTML5 拖拽放置无键盘替代(本次不新增拖拽、不恶化;"点调色板选中→点槽位放置"的键盘回退列为后续可选项)。
- **电气正确性(本任务真正的红线)**:PV 永不抵扣 calc.amps;不发布未经持证核实的 120% 系数;虚假超载警告本期必修;放置引擎泛化(fitsAt)不因 YAGNI 砍掉——简洁与红线冲突处,红线赢。

### 6.4 实施风险

- 断点 1100→1360 使 1101~1360px 用户从"溢出三栏"变单列——是修复不是回归,但 tester 需在单列下确认拖拽/subpanel/打印功能完整。
- `.unit` 高度改内联 style 后,打印 CSS(700-714 行)高度随排版走,理论不受影响;tester 打印预览抽查含 span4 面板。
- 泛化 `occupiedAt` 是全页放置逻辑共享裁判,selfcheck 覆盖不到 UI 层——tester 手工用例:span4 放置成功/越面板底拒绝/与既有 unit 重叠拒绝/moveUnit 平移到与自身重叠的相邻位/缩槽裁剪 span4。
- sticky 的 `top`/`max-height` 数值依赖 AdminShell 顶栏 56px,实现时浏览器实测微调(误差只影响观感不影响功能)。

## 7. ADRs recorded

- **ADR-003**:Solar PV 永不抵扣 8-200 计算负荷;connectedAmps 排除 solar;120% 母线校验为独立层、持证确认前不实现。
- **ADR-004**:放置引擎泛化任意 span(fitsAt 单点裁判);circuits 增可选 volt,load_calc JSONB 向后兼容。

## 8. Open questions for Kuo

1. **"2-Pole 110V" 的确切语义**:是共脱扣 2 极断路器带两路 120V(handle-tie/MWBC 用法),还是单回路 120V 占 2 极?默认 amp 取多少(暂定 20A)?标签显示 "·120V" 可否(110V 是口语,铭牌为 120V)?
2. **4 槽 breaker 的组成**:是"两个 2-Pole 240V 叠放"(暂定 mk = 2×30A 2-pole),还是某种物理占 4 格的单台大框架 2-Pole(如老式 100A)?决定 circuits 结构与调色板文案。
3. **改名交互**:prompt 弹窗(推荐,与 editCircuit 一致、零新机制)还是 inline 编辑框?
4. **单列断点**:推荐 1360px(三栏只在真放得下时出现);若想让 1280 笔记本保住三栏,备选 = 保持 1100 断点、面板列内横向滚动(防撑爆保险两案共用,均不会再溢出)。
5. **120% 母线规则**:是否立项下一期?前置条件 = 持证电工按 Alberta 现行 CEC 版本确认 64-112 条款号/系数/适用条件 + UI 新增"busbar 额定"输入(默认=主开关额定,可改)。
6. **可选廉价警告**:subpanel 内 PV 开关额定之和 > feeder 额定时提示回馈超限,加不加?(默认不加)
7. **§6.1 两个提示级微调**(地下室面积按 75% 的灰字提示;打印时标注"计算负荷不低于 8-200(1)(b) 下限")要不要顺手做?

---

## Review

**Reviewer verdict: no BLOCKER. Design approved with Kuo's §8 answers folded in (3 diverge from architect's default recommendation). STEPS.md written accordingly.**

### Kuo's §8 answers actually used (override architect's default where noted)

1. **Q1 — DIVERGES from architect default.** Architect recommended handle-tied 2-pole breaker feeding two 120V/MWBC circuits (`pole:2, volt:120`, two circuit objects). Kuo chose: single 120V circuit that physically occupies 2 panel slots (`pole:1`, one circuit object, `volt:120` carried as data). This is electrically simpler and matches real old-style/wide-frame single-pole breakers. Consequence for implementation: the existing `v240` amber-indicator logic (`c.pole === 2 && u.kind === 'normal'`) needs **no change at all** — it already evaluates false for `pole:1`, so p2_120 correctly never shows the "second hot leg" amber tint. §3.5's draft `v240` formula rewrite is now moot and is not in STEPS.md.
2. **Q2 — DIVERGES from architect default.** Architect recommended two stacked 2-pole 240V breakers (two circuit objects) in one 4-slot type. Kuo chose: a single old-style large-frame 2-pole breaker, one 240V circuit, occupying 4 physical slots. Default amp 100A (large-frame breakers are physically wide because of higher interrupting/ampacity rating, not because they're low-amp — 60A doesn't justify 4 slots; 100A does, and it echoes the design's own "如老式 100A" precedent in §8 Q2's phrasing). `kind: 'normal'`, unaffected by `computeLoad`, consistent with §3.5's design intent.
3. **Q3 — DIVERGES from architect default.** Architect recommended `window.prompt` (reason: zero new UI mechanism, matches `editCircuit`). Kuo chose inline edit-in-place (click subpanel name → `<input>`, blur/Enter commits, Esc cancels). This is real, requested scope, not something to push back on — implemented as one new `editingSubId` state + one commit function, reusing §3.2's validation rule (trim/empty-fallback/24-char truncate) verbatim, just triggered by blur/Enter instead of a prompt return value. Cost is in line with what a11y-correct inline-edit always costs (a few lines), not the runaway complexity §4 worried about when it defaulted to rejecting this option.
4. Q4 — confirmed as architect default (1360px breakpoint), executed as designed.
5. Q5 — confirmed not implementing 120% busbar rule this period. No busbar-rating input added. Correct: an unverified CEC coefficient is a red-line risk (see §6.3 "电气正确性"), not a place to guess.
6. Q6 — confirmed not adding the optional PV-feedback-vs-feeder warning. No new logic.
7. Q7 — confirmed doing both: basement-75% grey hint next to the area input, and an 8-200(1)(b) minimum-service note on the print output (the print stylesheet only shows `#panelPrint`, so the note must live inside that subtree, not just in the on-screen verdict card, or it silently disappears when printed — this is the actual reason Kuo's "顺手做" instruction is a real fix, not decoration).

### Over-design deletion list (YAGNI ladder applied as critic)

**Nothing to cut.** The design already climbed the ladder correctly before I saw it:
- §4 already rejects the two most tempting shortcuts (data-only 4-slot type; prompt-based rename as the "cheap" option) with concrete failure-mode reasoning, not hand-waving.
- `fitsAt()` is a single ~6-line helper unifying 4 call sites that currently duplicate the same span-2-shaped bug; this is a **net deletion** of duplicated ad-hoc bounds-checking, not new abstraction — there is no second implementation, no interface, no config knob. It stays.
- No new dependency, no new UI mechanism beyond one native `<input>`/`<button>` pair for the inline rename (native platform feature, rung 4).
- 120% busbar rule and the optional PV-feedback warning are correctly left undone (Q5/Q6) rather than spec'd speculatively — this is YAGNI holding, not YAGNI violated.

### Red-line check (never cut, verified intact)

- **Trust-boundary validation**: feeder input still guarded (NaN/≤0 rejected, 15–400 range); subpanel rename still trims, falls back to old name on empty, truncates to 24 chars — same validation as the prompt version, just invoked from `onBlur`/`onKeyDown` instead of a prompt return value.
- **Data loss**: rename/feeder/new-breaker-type changes are all non-destructive; existing `keepFitting` silent-crop-on-shrink behavior is pre-existing and unchanged (not expanded, not newly introduced) — logged, not fixed, correctly out of scope.
- **Security**: no secrets, no injection surface (React escapes all rendered text), no new dependency.
- **Accessibility**: inline rename entry is a real `<button>` (native focus/keyboard support for free) that swaps to an `<input>` — both get visible `:focus-visible` styling in STEPS.md; this satisfies the a11y bar the architect set for the prompt-button version, just via a different (Kuo-requested) mechanism.
- **Electrical correctness** (this task's real red line, per §6.3): PV never offsets `calc.amps` (unchanged, verified untouched); no un-verified 120% coefficient shipped; the false-overload display bug is fixed at the correct layer (`connectedAmps` exclusion, not a cosmetic threshold tweak); `fitsAt()` placement generalization is kept even though it's the "expensive" rung — YAGNI does not touch it because a 4-slot breaker overlapping another breaker on a real panel diagram is a correctness defect, not a nice-to-have.

### One factual note (non-blocking, does not change what gets built)

§3.6 point 1 claims the SUB-1 real-world case goes from "125A → 85A, false overload disappears." Checking the arithmetic against the actual displayed comparison (`connectedAmps(sp.units) > sp.feederAmp`, i.e. 125A vs a 60A feeder): removing the 2×20A=40A of solar gives 85A, which is **still greater than a 60A feeder** — the warning would still fire post-fix in that specific numeric anecdote, unless the real feeder rating in that case was actually higher than 60A (plausible, but not verifiable from DESIGN.md's text alone). This doesn't change the correctness of the fix itself (excluding solar from a *load* sum is unambiguously right per §6.2 Q3's electrical reasoning, independent of whether this one anecdote's warning fully clears or just shrinks). Flagging so nobody re-quotes "125→85, warning disappears" as a verified fact. STEPS.md's regression test uses clean synthetic numbers rather than asserting the disputed "≤60A" outcome.

**No BLOCKER. Proceeding to STEPS.md.**
