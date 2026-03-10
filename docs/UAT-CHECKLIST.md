## UAT / 验收测试清单（本地 Docker）

### 0. 启动与自检
- **启动**：在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests -BackupAfter
```

- **确认页面可访问**
  - **顾客端**：`http://localhost:7220/quote`
  - **Admin**：`http://localhost:7221/admin`
  - **API docs**：`http://localhost:7222/docs`

### 1. 顾客端（Customer）
- **欢迎页**
  - CTA 正常进入 step1/step2
  - 中英文切换正常
- **Step1 / Step2**
  - 必填校验正常（nickname/phone/email/address 等）
  - **地址输入**：未配置 `VITE_GOOGLE_MAPS_API_KEY` 时能手动输入；配置后能联想选择
  - Survey slots 可勾选多个
- **提交成功**
  - 生成 Reference（如 `FFT-2026-000x`）
  - 成功进入 Status 页
- **状态页**
  - Timeline 正常展示（状态/备注/时间）
  - 当 customer 报备 e-transfer，但 admin 尚未确认时，有“报备但未入账”的提示
- **Survey Confirm（e-transfer）**
  - 显示收款信息（邮箱/金额/Reference）
  - “我已完成转账”按钮可提交报备
- **Quote View / Approve**
  - Admin 发送 quote 后，顾客端能查看报价明细与 total
  - Approve 页：必须签名才能提交
  - 通过后 QuoteView 显示 Approved + 签名图

### 2. Admin（后台）
- **登录**
  - 默认（development 自动创建）：`admin / admin1234`
  - 登录失败多次会触发 **429**（节流生效）
- **Dashboard**
  - counters 正常显示（pending / to quote / surveys next 7 days 等）
  - revenue month/quarter & completed month/quarter 正常显示
  - 最近活动 Recent activity 有高亮（Pill）
  - counters 的跳转链接可进入对应列表并自动筛选
- **Cases 列表**
  - 搜索/筛选可用
  - 点进 CaseDetail
- **CaseDetail**
  - Survey：可 schedule / complete / 标记 deposit paid
  - Quote：可 create / send / preview；能看到 signature
  - Permit：可 applied/approved/revision_required；附件上传/删除
  - Installation：可 schedule / complete / send completion email
  - Timeline：关键节点有 `Pill` 高亮
- **Surveys / Installations**
  - Calendar/List 切换正常（周网格）
  - 各项筛选、CSV 导出可用
- **Settings（Super Admin）**
  - email/sms 模板 JSON 可加载/保存
  - e-transfer settings JSON 可加载/保存
- **Users（Super Admin）**
  - 列表/创建/编辑/禁用/删除正常（如有）

### 3. 通知（Email/SMS）
- 在 dev 环境可以不配置 SMTP/Twilio（不会阻塞主流程）
- 配置后（可选）验证：
  - submission confirm / survey scheduled / quote ready / completion 等模板渲染正确
  - DB 模板可 extends `base.html` 正常
  - 本地可选用 Mailpit 确认每封邮件都生成：`docker compose -f docker-compose.yml -f docker-compose.mailpit.yml --env-file .env up --build -d`，打开 `http://localhost:7224`

### 4. 数据备份/回滚
- **备份**：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1
```

- **恢复**（选一个备份文件）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -File .\backups\<file>.sql
```

