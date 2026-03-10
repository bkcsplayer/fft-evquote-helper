---
name: ev-charger-quote-system
description: EV户用充电桩安装报价与项目管理系统。包含顾客端 Mobile Web（信息收集、报价查看、状态追踪）、Admin Panel（Case全生命周期管理、报价生成、Survey/安装排期、Permit追踪、推荐人统计）、后端API、自动化通知（Email + Twilio SMS）、e-transfer 支付集成。技术栈：React + TailwindCSS / FastAPI / PostgreSQL / Docker。
---

# EV Charger Quote System (FFT / FutureFrontier Technology)

EV 户用充电桩安装的全流程业务管理系统：从顾客询价 → 上门勘察 → 报价 → Permit → 安装 → 完工。

## 项目概述

**项目名称**: FFT EV Charger Quote System
**一句话描述**: 让 EV 充电桩安装业务从询价到完工全流程数字化
**目标用户**: 需要安装家用 EV 充电桩的屋主（顾客端）+ FFT 内部团队（Admin 端）
**核心价值**: 减少手动沟通，自动化通知，标准化报价，追踪每个 case 全生命周期
**业务区域**: Calgary, Alberta, Canada

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 顾客前端 | React + TailwindCSS (Mobile-first Web App) |
| Admin 前端 | React + TailwindCSS + shadcn/ui |
| 后端 | FastAPI (Python) |
| 数据库 | PostgreSQL |
| 支付 | e-transfer (Survey Deposit) |
| 邮件 | SMTP (可选 SendGrid / AWS SES) |
| 短信 | Twilio SMS |
| 文件存储 | 本地卷 / S3 兼容存储 |
| 容器化 | Docker + docker-compose |
| 部署 | VPS + 宝塔面板 |

---

## 业务流程（核心状态流）

```
pending                  → 顾客提交表单，等待处理
survey_scheduled         → Admin 安排了 survey 日期，通知顾客
survey_completed         → Survey 完成，照片已上传
quoting                  → Admin 正在制作报价
quoted                   → 报价已发送给顾客，等待确认
customer_approved        → 顾客已确认报价（电子签名）
permit_applied           → 已提交 Permit 申请
permit_approved          → Permit 已批准
installation_scheduled   → 安装日期已排定，通知顾客
installed                → 安装完成
completed                → 完工邮件已发送（保修+免责），Case 关闭
cancelled                → 任何阶段可取消
```

### 状态转换规则

```
pending → survey_scheduled           (Admin 安排 survey)
pending → cancelled                  (顾客取消或 Admin 关闭)
survey_scheduled → survey_completed  (Admin 标记 survey 完成 + 上传照片)
survey_scheduled → cancelled
survey_completed → quoting           (Admin 开始制作报价)
quoting → quoted                     (Admin 发送报价给顾客)
quoted → customer_approved           (顾客通过链接确认 + 签名)
quoted → quoting                     (顾客要求修改，Admin 重新报价)
quoted → cancelled
customer_approved → permit_applied   (Admin 提交 permit)
permit_applied → permit_approved     (Permit 通过)
permit_approved → installation_scheduled (Admin 排安装日期)
installation_scheduled → installed   (安装完成)
installed → completed                (发送完工邮件)
```

---

## 用户角色

| 角色 | 描述 | 权限 |
|------|------|------|
| Customer (顾客) | 需要安装充电桩的屋主 | 提交询价、查看状态、查看/确认报价、接收通知 |
| Admin | FFT 内部操作人员 | 全部管理功能：Case/Survey/报价/Permit/安装/统计 |
| Super Admin | FFT 老板 | Admin 全部权限 + 用户管理 + 系统设置 |

---

## 功能模块详细设计

### 模块 1: 顾客端 Mobile Web App

#### 1.1 首页 / 欢迎页
- FFT 品牌 Logo + 简短介绍文案
- "Get a Free Quote" CTA 按钮
- 简洁、信任感设计（可加客户评价/安装案例数）

#### 1.2 Step 1 - 基本信息
- 称呼（昵称，非真名）- 必填
- 联系电话 - 必填，加拿大格式校验
- 点击 "Next" 进入下一步

#### 1.3 Step 2 - 安装信息收集（多步表单 / Wizard）
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 充电桩品牌 | 下拉选单 | 是 | 预设品牌列表 + "还没买/需要推荐" 选项 |
| 电车品牌 | 文本输入 | 是 | 手动输入 |
| 邮箱 | Email 输入 | 是 | 用于接收所有通知 |
| 安装地址 | 地址输入 | 是 | 支持 Google Places Autocomplete |
| 提车日期 | 日期选择 | 否 | 帮助了解时间线 |
| 期望安装完成日期 | 日期选择 | 否 | 判断紧急程度 |
| 推荐人 | 文本输入 | 否 | 谁推荐来的 |
| Survey 预约时段 | 时段选择 | 是 | 可选多个偏好时段 |
| 备注 | 多行文本 | 否 | 任何额外信息 |

**充电桩品牌预设列表**:
- Tesla Wall Connector
- ChargePoint Home Flex
- Grizzl-E
- Emporia
- Wallbox Pulsar Plus
- Autel MaxiCharger
- JuiceBox
- Lectron V-Box
- 其他（请注明）
- 还没买 / 需要推荐

**Survey 时段选择设计**:
- 以周为单位显示未来 2 周的可用时段
- 上午 (9-12) / 下午 (12-3) / 傍晚 (3-6)
- 顾客可勾选多个偏好时段
- Admin 后续从中确认一个具体日期时间

#### 1.4 提交确认页
- 显示提交成功信息
- 告知下一步流程："我们会尽快联系您安排 Site Survey"
- 提供 Case Reference Number

#### 1.5 顾客状态追踪页 (Status Page)
- 通过邮件/短信中的唯一链接访问（带 token）
- 无需登录
- 显示当前 Case 状态（可视化进度条）
- 显示关键时间节点（提交时间、survey 日期、报价日期等）
- 显示下一步预期行动

#### 1.6 Survey 预约确认 + 支付页
- Admin 确认 survey 日期后，顾客收到邮件/短信，链接到此页
- 显示 survey 日期时间
- e-transfer 支付 $99 Survey Deposit（顾客按收款信息转账，并点击“我已完成转账”提交报备）
- 支付说明："如果由我们完成安装，此费用将从总报价中抵扣。如最终未选择我们安装，此费用不予退还。"
- 支付成功后更新状态 + 发送确认通知

#### 1.7 报价查看 + 确认页
- 通过邮件/短信中的唯一链接访问
- 显示完整报价明细：
  - 安装类型（明线/暗线）
  - 基础包价格
  - 超出距离费用
  - Permit 费用
  - 附加项目
  - Survey Deposit 抵扣
  - 总价 + GST
- 服务条款与免责声明（从报价文档中提取的 4 条条款）
- "我已阅读并同意" 复选框
- 电子签名区域（签名板 / 输入姓名作为签名）
- "确认报价" 按钮
- 如有疑问可点击"联系我们"

---

### 模块 2: Admin Panel

#### 2.1 Dashboard 首页
- 今日待处理 Case 数
- 本周 Survey 排期日历视图
- 待确认报价数量
- 进行中安装数量
- 本月/本季度收入统计（已完成项目）
- 近期活动 Feed（最近状态变更）
- 快速操作入口

#### 2.2 Case 管理
- Case 列表：支持按状态筛选、搜索（名字/电话/地址）、排序
- Case 详情页：
  - 顾客信息卡片
  - 状态时间线（每次状态变更的时间 + 操作人 + 备注）
  - 操作按钮（根据当前状态显示可用操作）
  - Survey 信息区域
  - 报价信息区域
  - Permit 信息区域
  - 安装信息区域
  - 照片区域
  - 通知历史（发过的邮件/短信记录）
  - 内部备注（Admin 之间的沟通记录）

#### 2.3 Survey 管理
- 日历视图：显示所有已安排的 survey
- 安排 survey：选择日期时间 → 自动发送通知给顾客
- 标记 survey 完成
- 上传 survey 照片（分类上传）：
  - 配电盘正面照
  - 配电盘内部（打开盖子）
  - 电表照片
  - 安装位置照片
  - 走线路径照片
  - 其他现场照片
- Survey 备注（现场发现的问题、特殊情况记录）

#### 2.4 报价系统
**报价模板表单**（基于你的报价文档结构）：

| 字段 | 说明 |
|------|------|
| 安装类型 | 选择: 明线(Surface Mount) / 暗线(Concealed) |
| 基础包价格 | 明线 $699 / 暗线 $849（可在系统设置中调整默认价格） |
| 超出距离(米) | 数字输入，系统自动计算（明线 $30/m, 暗线 $55/m） |
| Permit 费 | 默认 $349（可调整） |
| Survey Deposit 抵扣 | 默认 -$99（如已支付） |
| NEMA 14-50 升级 | 可选附加项，手动输入价格 |
| 其他附加项 | 可动态添加行项目（名称 + 价格） |
| 备注 | 给顾客的额外说明 |
| 自动计算 | 小计 + GST(5%) = 总价 |

**报价操作**:
- 预览报价（HTML 渲染，与顾客看到的一致）
- 保存草稿
- 发送报价（触发邮件+短信通知顾客）
- 版本管理：每次修改自动保存为新版本（v1, v2, v3...），可查看历史版本

#### 2.5 Permit 追踪
| 字段 | 说明 |
|------|------|
| Permit Number | 手动输入 |
| 提交日期 | 日期选择 |
| 预计审批日期 | 日期选择 |
| 实际审批日期 | 日期选择 |
| 状态 | applied / approved / revision_required |
| 备注 | 文本 |
| 附件 | 上传 permit 相关文件 |

#### 2.6 安装排期
- 日历视图：显示所有已排安装
- 安排安装日期 → 自动通知顾客
- 标记安装完成 → 触发完工流程

#### 2.7 完工处理
- 安装完成后，生成完工邮件
- 邮件内容模板（基于你的报价文档中的条款）：
  - 感谢信
  - 施工概述
  - 保修条款（1年工艺质保）
  - 免责声明（设备由客户自购、电箱原有违规等 4 条条款）
  - 联系方式
- 预览 → 发送

#### 2.8 推荐人统计
- 推荐人列表：每个推荐人带来的客户数量
- 转化率统计：推荐 → 完成安装的转化比
- 时间趋势图
- 可用于制定 Referral Program / 佣金计算

#### 2.9 系统设置 (Super Admin)
- 默认价格配置（基础包价格、单米价格、Permit 费用等）
- 充电桩品牌列表管理（增删改）
- 邮件模板管理
- 短信模板管理
- e-transfer 配置（收款人姓名/邮箱/说明）
- Twilio 配置
- Admin 用户管理

---

### 模块 3: 通知系统

#### 3.1 通知触发时机 + 渠道

| 触发事件 | Email | SMS | 接收人 |
|----------|-------|-----|--------|
| 顾客提交表单 | ✅ 自动回复 | ✅ 确认短信 | 顾客 |
| 新 Case 进入 | ✅ | ❌ | Admin |
| Survey 日期确认 | ✅ 含支付链接 | ✅ 含支付链接 | 顾客 |
| Survey Deposit 支付成功 | ✅ 收据 | ❌ | 顾客 |
| 报价发送 | ✅ 含查看链接 | ✅ 含查看链接 | 顾客 |
| 顾客确认报价 | ✅ | ✅ | Admin |
| Permit 状态更新 | ✅ | ❌ | 顾客 |
| 安装日期确认 | ✅ | ✅ | 顾客 |
| 安装完成 / 完工邮件 | ✅ 完整版 | ✅ 简短通知 | 顾客 |

#### 3.2 邮件模板（HTML 格式）
所有邮件使用统一的 FFT 品牌模板：
- Logo + 品牌色
- 响应式 HTML（手机端友好）
- 底部有公司信息 + 联系方式

#### 3.3 短信模板
简洁明了，包含关键信息 + 链接：
```
[FFT] Hi {name}, your EV charger site survey is scheduled for {date} at {time}.
Please confirm and pay the $99 deposit here: {link}
```

---

### 模块 4: 支付（e-transfer）

- 仅用于 $99 Survey Deposit 收取
- 顾客端展示收款邮箱/金额/Reference（Case 编号），顾客自行转账
- 顾客点击“我已完成转账”进行报备（系统记录 Timeline + 内部备注）
- Admin 核对入账后在后台标记 “deposit paid”，系统自动发送收款确认通知
- 在报价中显示已支付 deposit 的抵扣

---

## 数据库设计

### 表: customers (顾客)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| nickname | VARCHAR(100) | 称呼 |
| phone | VARCHAR(20) | 联系电话 |
| email | VARCHAR(255) | 邮箱 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: cases (项目 Case)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| reference_number | VARCHAR(20) | Case 编号，如 FFT-2026-0001 |
| customer_id | UUID FK | 关联顾客 |
| status | ENUM | 状态（见状态流） |
| charger_brand | VARCHAR(100) | 充电桩品牌 |
| ev_brand | VARCHAR(100) | 电车品牌 |
| install_address | TEXT | 安装地址 |
| pickup_date | DATE | 提车日期 |
| preferred_install_date | DATE | 期望安装完成日期 |
| referrer | VARCHAR(100) | 推荐人 |
| preferred_survey_slots | JSONB | 偏好 survey 时段 |
| notes | TEXT | 顾客备注 |
| access_token | VARCHAR(64) | 顾客访问 token（状态页/报价页） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: case_status_history (状态变更历史)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| from_status | VARCHAR(50) | 原状态 |
| to_status | VARCHAR(50) | 新状态 |
| changed_by | UUID FK | 操作人(admin user id) |
| note | TEXT | 备注 |
| created_at | TIMESTAMP | 变更时间 |

### 表: surveys (Survey 勘察)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| scheduled_date | TIMESTAMP | 预约日期时间 |
| completed_at | TIMESTAMP | 实际完成时间 |
| deposit_amount | DECIMAL(10,2) | Deposit 金额 |
| deposit_paid | BOOLEAN | 是否已支付 |
| stripe_payment_id | VARCHAR(255) | （已弃用）历史字段，Stripe 已禁用 |
| survey_notes | TEXT | 现场备注 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: survey_photos (Survey 照片)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| survey_id | UUID FK | 关联 Survey |
| category | ENUM | 类别: panel_front, panel_inside, meter, install_location, wiring_path, other |
| file_path | VARCHAR(500) | 文件存储路径 |
| file_name | VARCHAR(255) | 原始文件名 |
| caption | TEXT | 照片说明 |
| created_at | TIMESTAMP | 上传时间 |

### 表: quotes (报价)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| version | INTEGER | 版本号 (1, 2, 3...) |
| install_type | ENUM | surface_mount / concealed |
| base_price | DECIMAL(10,2) | 基础包价格 |
| extra_distance_meters | DECIMAL(5,1) | 超出距离(米) |
| extra_distance_rate | DECIMAL(10,2) | 每米单价 |
| extra_distance_cost | DECIMAL(10,2) | 超出距离费用(自动计算) |
| permit_fee | DECIMAL(10,2) | Permit 费 |
| survey_credit | DECIMAL(10,2) | Survey Deposit 抵扣 |
| subtotal | DECIMAL(10,2) | 小计 |
| gst_rate | DECIMAL(4,2) | GST 税率 (默认 5%) |
| gst_amount | DECIMAL(10,2) | GST 金额 |
| total | DECIMAL(10,2) | 总价 |
| admin_notes | TEXT | 内部备注 |
| customer_notes | TEXT | 给顾客的说明 |
| sent_at | TIMESTAMP | 发送给顾客的时间 |
| is_active | BOOLEAN | 是否为当前有效版本 |
| created_by | UUID FK | 创建人 |
| created_at | TIMESTAMP | 创建时间 |

### 表: quote_addons (报价附加项)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| quote_id | UUID FK | 关联报价 |
| name | VARCHAR(255) | 项目名称 |
| price | DECIMAL(10,2) | 价格 |
| description | TEXT | 说明 |

### 表: quote_signatures (电子签名)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| quote_id | UUID FK | 关联报价 |
| signature_data | TEXT | 签名数据 (base64 / 文字签名) |
| signed_name | VARCHAR(255) | 签署人姓名 |
| signed_at | TIMESTAMP | 签署时间 |
| ip_address | VARCHAR(45) | 签署时 IP |

### 表: permits (Permit)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| permit_number | VARCHAR(100) | Permit 编号 |
| applied_date | DATE | 提交日期 |
| expected_approval_date | DATE | 预计审批日期 |
| actual_approval_date | DATE | 实际审批日期 |
| status | ENUM | applied / approved / revision_required |
| notes | TEXT | 备注 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: permit_attachments (Permit 附件)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| permit_id | UUID FK | 关联 Permit |
| file_path | VARCHAR(500) | 文件路径 |
| file_name | VARCHAR(255) | 文件名 |
| created_at | TIMESTAMP | 上传时间 |

### 表: installations (安装)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| scheduled_date | TIMESTAMP | 安装日期 |
| completed_at | TIMESTAMP | 完成时间 |
| completion_email_sent | BOOLEAN | 完工邮件是否已发送 |
| notes | TEXT | 安装备注 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: admin_users (管理员)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | VARCHAR(100) | 用户名 |
| email | VARCHAR(255) | 邮箱 |
| password_hash | VARCHAR(255) | 密码哈希 |
| role | ENUM | admin / super_admin |
| is_active | BOOLEAN | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表: notifications (通知记录)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| channel | ENUM | email / sms |
| recipient | VARCHAR(255) | 收件人(邮箱或手机号) |
| template_name | VARCHAR(100) | 模板名称 |
| subject | VARCHAR(500) | 主题(邮件) |
| content | TEXT | 发送内容 |
| status | ENUM | sent / failed / pending |
| sent_at | TIMESTAMP | 发送时间 |
| error_message | TEXT | 失败原因 |
| created_at | TIMESTAMP | 创建时间 |

### 表: case_notes (内部备注)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| case_id | UUID FK | 关联 Case |
| admin_user_id | UUID FK | 操作人 |
| content | TEXT | 备注内容 |
| created_at | TIMESTAMP | 创建时间 |

### 表: system_settings (系统设置)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| key | VARCHAR(100) | 配置键 |
| value | JSONB | 配置值 |
| updated_at | TIMESTAMP | 更新时间 |

**默认系统设置**:
```json
{
  "surface_mount_base_price": 699.00,
  "concealed_base_price": 849.00,
  "surface_mount_per_meter": 30.00,
  "concealed_per_meter": 55.00,
  "permit_fee": 349.00,
  "survey_deposit": 99.00,
  "gst_rate": 5.00,
  "base_distance_included": 5
}
```

### 表: charger_brands (充电桩品牌管理)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(100) | 品牌名称 |
| sort_order | INTEGER | 排序 |
| is_active | BOOLEAN | 是否启用 |

### 关系图

```
customers 1 ──── N cases
cases 1 ──── N case_status_history
cases 1 ──── 1 surveys
surveys 1 ──── N survey_photos
cases 1 ──── N quotes
quotes 1 ──── N quote_addons
quotes 1 ──── 0..1 quote_signatures
cases 1 ──── 0..1 permits
permits 1 ──── N permit_attachments
cases 1 ──── 0..1 installations
cases 1 ──── N notifications
cases 1 ──── N case_notes
admin_users 1 ──── N case_status_history
admin_users 1 ──── N quotes (created_by)
admin_users 1 ──── N case_notes
```

---

## API 设计

### 公开接口 (顾客端, 无需认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/charger-brands | 获取充电桩品牌列表 |
| POST | /api/v1/cases | 提交询价表单 |
| GET | /api/v1/cases/status/{token} | 通过 token 查看 Case 状态 |
| GET | /api/v1/quotes/view/{token} | 通过 token 查看报价 |
| POST | /api/v1/quotes/approve/{token} | 通过 token 确认报价 + 签名 |
| GET | /api/v1/payments/etransfer-info/{token} | 获取 e-transfer 收款信息（金额/收款邮箱/Reference） |
| POST | /api/v1/payments/etransfer-notify | 顾客报备“已完成 e-transfer” |

### Admin 接口 (JWT 认证)

**认证**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/auth/login | Admin 登录 |
| POST | /api/v1/admin/auth/refresh | 刷新 Token |
| GET | /api/v1/admin/auth/me | 当前用户信息 |

**Dashboard**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/dashboard/stats | Dashboard 统计数据 |
| GET | /api/v1/admin/dashboard/recent-activity | 近期活动 |

**Case 管理**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/cases | Case 列表(筛选/搜索/分页) |
| GET | /api/v1/admin/cases/{id} | Case 详情 |
| PATCH | /api/v1/admin/cases/{id}/status | 更新状态 |
| POST | /api/v1/admin/cases/{id}/notes | 添加内部备注 |
| GET | /api/v1/admin/cases/{id}/timeline | 状态时间线 |
| GET | /api/v1/admin/cases/{id}/notifications | 通知历史 |

**Survey 管理**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/cases/{id}/survey/schedule | 安排 survey |
| PATCH | /api/v1/admin/cases/{id}/survey/complete | 标记完成 |
| PATCH | /api/v1/admin/cases/{id}/survey/deposit-paid | Admin 标记订金已入账(e-transfer) |
| POST | /api/v1/admin/cases/{id}/survey/photos | 上传照片 |
| DELETE | /api/v1/admin/survey/photos/{photo_id} | 删除照片 |
| GET | /api/v1/admin/surveys/calendar | Survey 日历数据 |

**报价管理**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/cases/{id}/quotes | 创建报价 |
| GET | /api/v1/admin/cases/{id}/quotes | 获取所有报价版本 |
| GET | /api/v1/admin/quotes/{quote_id} | 报价详情 |
| PUT | /api/v1/admin/quotes/{quote_id} | 更新报价(创建新版本) |
| POST | /api/v1/admin/quotes/{quote_id}/send | 发送报价给顾客 |
| GET | /api/v1/admin/quotes/{quote_id}/preview | 报价预览 |

**Permit 管理**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/cases/{id}/permit | 创建 Permit |
| PATCH | /api/v1/admin/permits/{permit_id} | 更新 Permit |
| POST | /api/v1/admin/permits/{permit_id}/attachments | 上传附件 |

**安装管理**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/admin/cases/{id}/installation/schedule | 安排安装 |
| PATCH | /api/v1/admin/cases/{id}/installation/complete | 标记完成 |
| POST | /api/v1/admin/cases/{id}/completion-email | 发送完工邮件 |
| GET | /api/v1/admin/installations/calendar | 安装日历数据 |

**推荐人统计**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/referrers/stats | 推荐人统计 |

**系统设置 (Super Admin)**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/admin/settings | 获取设置 |
| PUT | /api/v1/admin/settings | 更新设置 |
| GET | /api/v1/admin/charger-brands | 品牌管理列表 |
| POST | /api/v1/admin/charger-brands | 新增品牌 |
| PUT | /api/v1/admin/charger-brands/{id} | 编辑品牌 |
| DELETE | /api/v1/admin/charger-brands/{id} | 删除品牌 |
| GET | /api/v1/admin/users | Admin 用户列表 |
| POST | /api/v1/admin/users | 新增 Admin |
| PUT | /api/v1/admin/users/{id} | 编辑 Admin |

---

## 页面路由规划

### 顾客端 (/quote)

| 页面 | 路径 | 说明 |
|------|------|------|
| 欢迎页 | /quote | 首页 CTA |
| Step 1 | /quote/step1 | 基本信息 |
| Step 2 | /quote/step2 | 安装信息 |
| 提交成功 | /quote/submitted | 确认页 |
| 状态追踪 | /quote/status/{token} | Case 状态 |
| Survey 确认+支付 | /quote/survey-confirm/{token} | Survey 确认+e-transfer |
| 报价查看 | /quote/view/{token} | 查看报价 |
| 报价确认 | /quote/approve/{token} | 确认签名 |

### Admin Panel (/admin)

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录 | /admin/login | 管理员登录 |
| Dashboard | /admin/dashboard | 数据概览 |
| Case 列表 | /admin/cases | 列表页 |
| Case 详情 | /admin/cases/{id} | 详情管理 |
| 创建报价 | /admin/cases/{id}/quote/new | 报价表单 |
| Survey 日历 | /admin/surveys | 日历视图 |
| 安装日历 | /admin/installations | 日历视图 |
| 推荐人统计 | /admin/referrers | 统计面板 |
| 系统设置 | /admin/settings | 设置页 |
| Admin 用户 | /admin/users | 用户管理 |

---

## 项目结构

```
ev-charger-quote/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── README.md
│
├── frontend/                      # 顾客端 Mobile Web
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                # 通用 UI 组件
│   │   │   ├── layout/            # 布局组件
│   │   │   ├── forms/             # 表单组件
│   │   │   └── quote/             # 报价展示组件
│   │   ├── pages/
│   │   │   ├── Welcome.jsx
│   │   │   ├── Step1.jsx
│   │   │   ├── Step2.jsx
│   │   │   ├── Submitted.jsx
│   │   │   ├── StatusPage.jsx
│   │   │   ├── SurveyConfirm.jsx
│   │   │   ├── QuoteView.jsx
│   │   │   └── QuoteApprove.jsx
│   │   ├── services/              # API 调用
│   │   ├── hooks/                 # 自定义 Hooks
│   │   ├── utils/
│   │   ├── i18n/                  # 中英文翻译
│   │   └── App.jsx
│   └── nginx.conf
│
├── admin/                         # Admin Panel
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   ├── dashboard/
│   │   │   ├── cases/
│   │   │   ├── surveys/
│   │   │   ├── quotes/
│   │   │   ├── permits/
│   │   │   ├── installations/
│   │   │   └── settings/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── stores/                # 状态管理
│   │   ├── utils/
│   │   ├── i18n/
│   │   └── App.jsx
│   └── nginx.conf
│
├── backend/                       # FastAPI 后端
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py              # 环境变量配置
│   │   ├── database.py            # DB 连接
│   │   ├── models/                # SQLAlchemy 模型
│   │   │   ├── customer.py
│   │   │   ├── case.py
│   │   │   ├── survey.py
│   │   │   ├── quote.py
│   │   │   ├── permit.py
│   │   │   ├── installation.py
│   │   │   ├── admin_user.py
│   │   │   ├── notification.py
│   │   │   └── system_setting.py
│   │   ├── schemas/               # Pydantic schemas
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── public/        # 顾客端公开接口
│   │   │       │   ├── cases.py
│   │   │       │   ├── quotes.py
│   │   │       │   └── payments.py
│   │   │       └── admin/         # Admin 接口
│   │   │           ├── auth.py
│   │   │           ├── dashboard.py
│   │   │           ├── cases.py
│   │   │           ├── surveys.py
│   │   │           ├── quotes.py
│   │   │           ├── permits.py
│   │   │           ├── installations.py
│   │   │           ├── referrers.py
│   │   │           └── settings.py
│   │   ├── services/              # 业务逻辑
│   │   │   ├── case_service.py
│   │   │   ├── quote_service.py
│   │   │   ├── notification_service.py
│   │   │   ├── email_service.py
│   │   │   ├── sms_service.py
│   │   │   └── payment_service.py
│   │   ├── middleware/
│   │   │   ├── auth.py            # JWT 认证
│   │   │   └── cors.py
│   │   ├── utils/
│   │   │   ├── token.py           # 顾客 access token 生成
│   │   │   └── reference.py       # Case 编号生成
│   │   └── templates/             # 邮件 HTML 模板
│   │       ├── base.html
│   │       ├── submission_confirm.html
│   │       ├── survey_scheduled.html
│   │       ├── quote_ready.html
│   │       └── completion.html
│   └── migrations/                # Alembic 迁移
│       └── versions/
│
├── uploads/                       # 文件存储卷
│   ├── survey_photos/
│   └── permit_attachments/
│
└── docs/
    ├── api.md
    ├── deployment.md
    └── 官方施工报价单与服务协议.docx
```

---

## Docker 配置

### docker-compose.yml (生产)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ev_charger_quote
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    restart: always
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/ev_charger_quote
      SECRET_KEY: ${SECRET_KEY}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD}
      FRONTEND_URL: ${FRONTEND_URL}
    volumes:
      - ./uploads:/app/uploads
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "3000:80"

  admin:
    build: ./admin
    restart: always
    ports:
      - "3001:80"

volumes:
  pgdata:
```

### .env.example

```env
# Database
DB_USER=ev_charger
DB_PASSWORD=your_secure_password

# Backend
SECRET_KEY=your_jwt_secret_key
FRONTEND_URL=https://quote.futurefrontier.ca

# e-transfer (Survey Deposit)
# Configure in Admin -> Settings -> `etransfer_settings` (recipient_name, recipient_email, instructions)

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# SMTP (Email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@futurefrontier.ca
SMTP_PASSWORD=xxx
SMTP_FROM_NAME=FutureFrontier Technology
```

---

## 开发计划

| 阶段 | 内容 | 预计时间 |
|------|------|----------|
| Phase 1 | 项目脚手架 + Docker + DB 迁移 + Admin 认证 | 2-3 天 |
| Phase 2 | 顾客端表单提交 + 自动邮件/短信 | 2-3 天 |
| Phase 3 | Admin Case 列表/详情 + 状态管理 | 2-3 天 |
| Phase 4 | Survey 管理 + 照片上传 + e-transfer 流程 | 2-3 天 |
| Phase 5 | 报价系统（模板生成 + 版本管理 + 发送） | 2-3 天 |
| Phase 6 | 顾客报价查看/确认 + 电子签名 | 1-2 天 |
| Phase 7 | Permit 追踪 + 安装排期 + 完工邮件 | 2 天 |
| Phase 8 | Dashboard + 推荐人统计 | 1-2 天 |
| Phase 9 | i18n + 响应式优化 + 系统设置 | 1-2 天 |
| Phase 10 | 测试 + Bug Fix + VPS 部署 | 2-3 天 |

---

## 服务条款模板内容（从报价文档提取）

以下条款用于完工邮件和报价确认页面：

### 1. 电箱容量与负载 (Panel Capacity & Load Calculation)
本报价基于房屋现有配电盘具备足够的剩余安培容量。如在最终负载计算或现场施工中发现容量不足，需额外加装电源管理系统（如 EVEMS / DCC）或进行电箱升级，相关费用将另行出具附加报价单。

### 2. 墙面/天花板修复免责 (Drywall & Patching Disclaimer)
如选择暗线穿墙，为安全敷设线缆可能需要在石膏板或天花板上开具检查孔。本报价不包含后期的墙面修补、抹灰及重新刷漆工作。

### 3. 市政验收与原有违规 (Permit & Pre-existing Violations)
Permit 费用仅涵盖本次新增 EV 充电桩电路的政府审批与检查员上门验收。如市政检查员在验收过程中发现房屋原有配电盘或线路存在不合规现象并要求整改，由此产生的额外费用由客户自行承担。

### 4. 设备与质保 (Equipment & Warranty)
本公司仅对线路敷设与施工工艺提供 1 年质保。本报价不包含 EV 充电桩设备本身。客户自行采购的充电桩若出现硬件故障或连网问题，请直接联系设备制造商。

---

## 关键注意事项

1. **顾客端无需注册/登录**: 全部通过 access_token 访问，降低使用门槛
2. **所有金额使用 CAD**: 货币单位为加元
3. **GST 5%**: Alberta 省只有联邦 GST，没有省销售税
4. **时区**: America/Edmonton (MST/MDT)
5. **语言**: 前端支持中英文切换 (i18n)，默认英文
6. **手机号格式**: +1 (XXX) XXX-XXXX 加拿大格式
7. **地址**: 支持 Google Places Autocomplete，格式为加拿大地址
8. **品牌色**: 使用 FFT / FutureFrontier Technology 品牌设计
9. **邮件发送**: 注意 Spam 防护，使用正确的 SPF/DKIM 设置
10. **支付**: 默认使用 e-transfer；顾客端支持“已转账报备”，Admin 端手动核对入账并标记 paid
