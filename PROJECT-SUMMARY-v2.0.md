# FFT EV 充电桩报价与项目管理系统 — 项目总结报告 · v2.0

> 版本:**v2.0**　｜　发布日期:**2026-07-03**　｜　分支:`main`　｜　发布 commit:`a32e2d7`
> 生产环境:https://evquote.khtain.com （Vultr VPS + 宝塔 Nginx 反代,Docker Compose 4 服务）
> 累计 49 个 commit / 8 次数据库迁移 / 118 API / 20 张表 / 13 状态。

---

## 1. 一句话定位

面向 **Calgary EV 充电桩安装商** 的**在线报价 + 全流程项目管理系统**:客户网页自助提交 → 勘测 → 报价 → 电子签约 → 许可 → 安装 → 完工全链路推进,后台一站式管理案件的日程/报价/财务/文件/许可,全程自动 Email/SMS 通知。

**v2.0 主题**:在 v1.0 完整业务系统之上,新增并打磨 **CEC 8-200 住宅负荷计算器(Load Calculator)** 模块——这是 EV 充电桩报价前"能不能装、要不要升级 service / 上 EVEMS"的技术判断工具,也是本版全部迭代的焦点。

---

## 2. 版本沿革:v1.0 → v2.0

### v1.0(基线,2026-03 ~ 2026-06 下旬)
一套"能跑并已上线"的全流程系统,6 月下旬完成精细化升级:
- 客户端零注册自助流程(4 步提交 + 实时状态跟踪 + Canvas 电子签约)
- 后台案件工作台(10 个 Tab)统管日程/报价/财务/文件/许可
- 结构化财务链(BOM 成本 → 报价收入 → 收款台账 → 毛利)
- 原子化防超售预约引擎(`SELECT ... FOR UPDATE`)+ 可配置服务区/容量
- 双渠道(Email/SMS)自动通知,模板后台可改(Jinja2 存 DB)
- 客户端 / 后台双端 Premium UI 重构(Plus Jakarta Sans + emerald 主色)

### v2.0(本版,2026-06-30 ~ 2026-07-03)
**Load Calculator 模块从 0 到可用,并打磨到实战可交付:**

| 迭代项 | 说明 | commit |
|---|---|---|
| 后端负荷计算字段 | `cases.load_calc` JSONB 列 + migration + 管理端 GET/PUT `/cases/{id}/load-calc` | `346a716` |
| Load Calculator 页面 | 面板搭建器(拖拽 6 种断路器)+ CEC 8-200 实时计算 + A4 打印,案件 Quote tab 绿色按钮入口,独立页 `/admin/cases/:id/load-calc` | `355ecdf` |
| CEC 算法核对修正 | 按 Calgary 官方 worksheet 逐条核对:修正**采暖 62-118 系数**、**其它负荷 item viii 分支**;新增**电/燃气供热开关**(燃气时采暖=0);填表分类提示 | `6cef999` |
| Subpanel 多面板 | subpanel 开关 + 添加/删除子面板 + 主面板自动生成紫色 feeder 馈线 + **EV 负荷跨主面板与所有 subpanel 求和** + feeder 连接负荷超载检测 | `1acce84` |
| 盘内拖动换位 | 已放置的 breaker / feeder 可拖到同面板空槽换位置(支持 1+3 等布局) | `88b31df` |
| 打印布局修复 | 竖版堆叠→**A4 横向并排 + `break-inside:avoid`**,主面板与 subpanel 排在一起、不再每盘一页、不再被页边界切断 | `e58c567` |

> 计算内核 `admin/src/utils/cecLoad.js` 为纯函数,配自检 `cecLoad.selfcheck.mjs`(每次改动跑,全断言通过)。

---

## 3. 开发过程遇到的困难与问题

### 3.1 基础设施 / 网络(最耗时)

**① Tailscale 接管本机 DNS 与路由 → 整机"断网"**
- 现象:浏览器 `ERR_NAME_NOT_RESOLVED` / `ERR_ADDRESS_UNREACHABLE`,GitHub 和自家网站都打不开,但 tailnet 内 `100.x` 私有 IP 正常。
- 根因:Tailscale 更新后接管了网卡 DNS(变为 `100.100.100.100`)和全局路由(`RouteAll=true`)。
- 解决:`tailscale set --accept-dns=false` + `tailscale set --accept-routes=false`(平时上网走本地网卡,Tailscale 只做点对点)。彻底根治可去 login.tailscale.com → DNS 关 Override。

**② Claude 执行环境出网受限**
- Bash 工具默认够不到公网 / VPS,需经 **PowerShell 调 Git Bash**(`C:\Program Files\Git\bin\bash.exe`),SSH 密码走 `SSH_ASKPASS` 机制。
- v2.0 收尾阶段网络已恢复,`git push` 与 VPS SSH(22 端口)在 Bash 工具内可直连,重新走回标准部署路线。

### 3.2 部署 / 版本管理(本版最大的坑)

**③ 三方代码漂移:本地 / GitHub / VPS 不一致**
- 早期为绕开 GitHub 不可达,用 **Tailscale 直传(scp 文件 + 重建容器)** 应急上线,导致 **VPS 工作树领先 origin、GitHub 落后本地 4 个 commit**。
- 危险点:`deploy.sh` 用 `git reset --hard origin/main`,若 GitHub 落后,下次标准部署会**把 VPS 上直传的领先内容冲掉**。
- 解决:网络恢复后 `git push origin main` 把本地 4 个 commit 补齐到 GitHub,再让 VPS `git reset --hard origin/main` 对齐,三方真正同步。

**④ "幽灵功能"—— subpanel 代码从未提交,更未部署**(本版最典型的 bug)
- 现象:用户在生产反复刷新(甚至手动加 `?v=3`)都看不到已"做好"的 subpanel 开关。
- 排查:对比 `git show HEAD:...LoadCalc.jsx` 与 working copy —— **HEAD 版本里 `subpanel`/`subEnabled` 出现 0 次,working copy 却有 36 次**。即整个 subpanel UI 一直躺在未提交的工作区,`825ded2` 只提交了 `cecLoad.js` 半截。
- 根因:上一轮记忆误记为"subpanel shipped / 三方同步",实际从未落盘 → 生产跑的是没有 subpanel 的旧 bundle。
- 教训:**"记忆说上线了"不等于"git 里有、生产在跑"**;排障先用 `git show HEAD:file` vs working copy 实证,别信记忆。已通过 curl 生产 bundle 校验字符串出现次数作为上线确认手段。

### 3.3 认证 / 登录困惑

**⑤ 后台登录用户名与密码来源**
- 后台管理员用户名是 **`FFTAdmin`**(邮箱 `admin@futurefrontiertech.ca`),不是直觉上的 `admin`。
- `BOOTSTRAP_ADMIN_*` 环境变量**只在数据库为空时创建管理员**,库里已有账号时**不会**用 `.env` 覆盖密码 → 改 `.env` 密码却登不上的困惑由此而来。排障时曾误以为凭据错误,实为用户名/密码来源理解偏差。

### 3.4 业务算法正确性

**⑥ CEC 8-200 负荷计算系数**
- 首版算法与 Calgary 官方 worksheet 存在偏差:采暖 **62-118** 需求系数、其它负荷 **item (viii)** 分支(有无电炉走不同 100%/25% 逻辑)取值需逐条核对修正。
- 供热来源(电 / 燃气)会实质改变计算(燃气供热时采暖负荷计 0),v2.0 增加了显式开关,避免误算。

---

## 4. 本版修复的 Bug 清单

| # | Bug | 影响 | 修复 |
|---|---|---|---|
| 1 | subpanel 全部 UI 从未 commit / 部署 | 用户在生产完全看不到该功能 | 提交 `1acce84` + push + VPS 重建;curl bundle 校验(subpanel 18 处) |
| 2 | feeder 自动放置且锁死,所有已放 breaker 均不可移动 | 无法排 1+3 等布局,feeder 位置不可调 | `88b31df` 复用拖放机制加 move 语义(`occupiedAt` 增 `exceptId` 忽略自身),同面板内可拖动换位 |
| 3 | 打印竖版堆叠,每个面板独占一页且可能被页边界切断 | 打印稿"撕裂"、浪费纸、不专业 | `e58c567` 改 A4 横向 + `flex row/wrap` 并排 + `break-inside:avoid` 防切断 |
| 4 | CEC 采暖 62-118 / 其它负荷 item viii 系数偏差 | 负荷计算结果不符合官方 worksheet | `6cef999` 逐条核对修正 + 电/燃气供热开关 |
| 5 | 三方代码漂移(VPS 领先 / GitHub 落后) | 标准部署会冲掉直传内容 | push 补齐 + reset 对齐,恢复标准 `deploy.sh` 流程 |

---

## 5. 部署与验证方式(本版沉淀的做法)

- **标准部署**:`deploy.sh "msg"` —— 本地 `git push` → SSH VPS `git reset --hard origin/main` + `docker compose -f docker-compose.vps.yml up -d --build`。前提是 GitHub 可达。
- **应急直传(尽量避免)**:经 Tailscale 私有 IP `100.125.45.25` scp + 重建;会造成三方漂移,用后必须补 push。
- **只重建前端**:仅改 admin 时 `docker compose ... up -d --build admin`,比全量快。
- **上线自证**:`curl https://evquote.khtain.com/admin/` 取 bundle 文件名 → `curl` 该 JS → `grep` 关键字符串出现次数,确认新代码真的在生产跑(而不是只信"部署完成"日志)。

---

## 6. 已知限制 / 后续可选项(非缺陷)

- Stripe 已停用,支付走 e-transfer(人工核实定金)。
- 服务区目前仅 Calgary。
- 后台无细粒度权限,`super_admin` 与 `admin` 仅在 Settings/Users 页区分。
- 通知为同步发送(失败记 `notifications` 表,可后台重发)。
- Load Calc 打印:盘特别多时仍会翻到第二页(已不撕裂);若需"多盘自动缩放全塞一页"或"竖版 A4"可再迭代。
- `image.png`(开发期临时截图)未纳入版本库。

---

## 7. 关键坐标(运维速查)

| 项 | 值 |
|---|---|
| 生产域名 | https://evquote.khtain.com |
| VPS | Vultr,公网 `45.76.242.112` / Tailscale `100.125.45.25` |
| 生产目录 | `/www/wwwroot/evquote.khtain.com/fft-evquote-helper` |
| compose | `docker-compose.vps.yml`,端口 `127.0.0.1:7620/7621/7622` |
| 本地端口 | frontend 7220 / admin 7221 / backend 7222 / db 7223 |
| 后台登录 | 用户名 `FFTAdmin`,密码 = `.env` 的 `BOOTSTRAP_ADMIN_PASSWORD`(仅空库生效) |
| 负荷计算内核 | `admin/src/utils/cecLoad.js`(纯函数)+ `cecLoad.selfcheck.mjs`(自检) |
| 功能全景 | `docs/SYSTEM-OVERVIEW.md` |

---

*本报告随 v2.0 发布归档。系统功能全景详见 `docs/SYSTEM-OVERVIEW.md`,人脑级现状/坑/决策见根目录 `MEMORY.md`。*
