# MEMORY — FFT EV 充电桩报价与项目管理系统

> 开工先读本文件。人脑级记忆:现状 / 下一步 / 技术栈 / 已知坑 / 关键决策。
> 详细功能全景见 `docs/SYSTEM-OVERVIEW.md`(2026-07-02 生成的完整系统盘点)。

---

## Current state(当前状态 · 就地覆盖)

**整体**:系统已相当完整并**已上线** `https://evquote.khtain.com`。覆盖客户自助提交 → 勘测 → 报价 → 电子签约 → 许可 → 安装 → 完工全链路。规模:9 客户端页 / 15 后台页(案件工作台 10 tab)/ 118 API / 20 张表 / 13 状态。

**最近一次开发(2026-07-02)**:Load Calculator(CEC 8-200 负荷计算器)。
- 位置:`admin/src/pages/LoadCalc.jsx` + 纯函数 `admin/src/utils/cecLoad.js`(+ 自检 `cecLoad.selfcheck.mjs`)。
- 入口:后台 → 案件 → **Quote tab 里的绿色按钮**,独立页 `/admin/cases/:id/load-calc`。
- 本次做完:①按 Calgary 官方 worksheet 逐条核对并**修正算法**(采暖 62-118 系数、其它负荷 item viii 分支)②新增**电/燃气供热开关**(燃气时采暖=0)③填表分类提示。
- 结果存 `case.load_calc`(JSONB)。commit `6cef999`。

**2026-07-03 修正 + 补上线**:subpanel(分面板)功能此前**从未提交也从未部署**——之前记忆误记"subpanel shipped/三方同步"是**错的**。commit `825ded2` 只提交了 `cecLoad.js` 半截,`LoadCalc.jsx` 的 subpanel UI(subEnabled 开关 + addSubpanel/removeSubpanel + feeder 自动放置 + EV 跨主面板/所有 subpanel 求和)一直躺在未提交 working copy 里。今天核对:HEAD 版 `subpanel` 出现 0 次,working copy 36 次。已提交 `1acce84` → push GitHub → VPS `git reset --hard origin/main` + 重建 admin 容器。**现三方真同步**,生产 bundle 已含 subpanel(18 处)。用户端记得 Ctrl+Shift+R 强刷。

## 下一步 / 待办

1. Load Calc + subpanel 上线后待用户实测反馈(拖拽、电/燃气切换、subpanel 开关/加删、打印、算法取值)。
2. `docs/SYSTEM-OVERVIEW.md` 为**新增未提交**文件,酌情提交。根目录 `image.png` 是用户临时截图,未跟踪,勿提交。

## 技术栈

- 前端 `frontend/`(客户端)+ `admin/`(后台):React + Vite + Tailwind
- 后端 `backend/`:FastAPI + SQLAlchemy + Alembic + PostgreSQL 16
- 通知:SMTP(Email)+ Twilio(SMS),Jinja2 模板(DB 可改)
- 部署:Docker Compose 4 服务;生产在 Vultr VPS + 宝塔 Nginx 反代

---

## 已知坑 / 部署要点(重要)

### 部署有两条路
1. **标准**:`./deploy.sh "msg"` —— 本地 push GitHub → SSH VPS 拉取重建。**需要能访问 github.com**(要开代理/正常 DNS)。push 这步只能在你自己终端跑(Claude 执行环境公网被沙箱拦,够不到 GitHub)。
2. **Tailscale 直传(应急/AI 代劳)**:当够不到 GitHub 时,经 Tailscale 私有 IP **`100.125.45.25`**(= Vultr 生产机 `vultr-vps`)直接 scp 文件 + 重建容器。详见记忆 `tailscale-vps-deploy`。
   - ⚠️ **副作用**:绕过 GitHub,VPS 工作树会领先 origin。**本次 `6cef999` 就是这么上的,记得补 push**,否则下次 `deploy.sh` 的 `git reset --hard origin/main` 会把它冲掉。

### Tailscale DNS/路由接管会导致本机"断网"(本次踩过)
- 现象:浏览器 `ERR_NAME_NOT_RESOLVED` / `ERR_ADDRESS_UNREACHABLE`,github/网站都打不开,但 tailnet 内 100.x 正常。
- 原因:Tailscale 更新后接管了本机 DNS(网卡 DNS 变 `100.100.100.100`)和路由(`RouteAll=true`)。
- 已修:`tailscale set --accept-dns=false` + `tailscale set --accept-routes=false`(平时上网走本地网卡,Tailscale 只做点对点)。若更新后反弹,重跑这两条;彻底根治去 login.tailscale.com → DNS 关 Override。

### VPS 直连的执行方式(AI 侧)
- Bash 工具本身无出网路由;要经 **PowerShell 调 Git Bash**(`C:\Program Files\Git\bin\bash.exe`,不是 System32 的 WSL bash),密码走 `SSH_ASKPASS`。

---

## 关键账号 / 路径

- **后台登录**:用户名 **`FFTAdmin`**(不是 admin!)/ 邮箱 `admin@futurefrontiertech.ca`,密码 = `.env` 的 `BOOTSTRAP_ADMIN_PASSWORD`(本次已重置为该值)。`bootstrap` 只在空库时创建管理员,不会用 .env 覆盖已存在账号。
- **VPS**:Vultr,公网 `45.76.242.112` / Tailscale `100.125.45.25`,目录 `/www/wwwroot/evquote.khtain.com/fft-evquote-helper`,compose `docker-compose.vps.yml`。
- **端口**:本地 frontend 7220 / admin 7221 / backend 7222 / db 7223;VPS 127.0.0.1:7620/7621/7622。
- **VPS root 密码**在 `deploy.sh`(gitignored,勿提交)。

---

## Log(只追加,带日期)

- **2026-07-03**:
  - 排障用户"生产看不到 subpanel 开关"。根因:subpanel 全部代码从未 commit(HEAD 里 0 次,working copy 36 次),之前"subpanel shipped"记忆写错。
  - 修复:本地 `1acce84` 提交 subpanel UI(build + cecLoad 自检双通过)→ `git push origin main`(355ecdf→1acce84,GitHub 本次可达,Tailscale DNS 坑未复发)→ VPS 经 SSH `git reset --hard origin/main` + `docker compose up -d --build admin`。生产 bundle 验证含 subpanel 18 处。三方真同步。
  - 增强 `88b31df`:Load Calc 支持**盘内拖动换位置**——已放置的 breaker/feeder 可拖到同面板空槽(`moveUnit` + `occupiedAt` 加 `exceptId` 忽略自身;仅同面板,feeder 不跨盘)。满足"feeder 换位 / 1+3 布局"需求。已 push + 部署,生产 bundle `Djt7ZiWJ`。
  - VPS 部署脚本模板存 scratchpad `deploy_vps.sh`(复用 deploy.sh 密码机制,只重建 admin)。
- **2026-07-02**:
  - Load Calc 完成 CEC 8-200 算法核对 + 修正(62-118 采暖、item viii)、新增电/燃气供热开关、填表提示。commit `6cef999`,经 Tailscale 直传上线(GitHub 待补 push)。
  - 排障:修复 Tailscale 接管 DNS/路由导致的本机断网(`--accept-dns=false` + `--accept-routes=false`)。
  - 重置后台管理员 `FFTAdmin` 密码为 `.env` 值,澄清登录用户名不是 `admin`。
  - 生成 `docs/SYSTEM-OVERVIEW.md`(全系统功能盘点)与本 `MEMORY.md`。
