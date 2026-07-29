
## Review（Reviewer, Sonnet 5/high，2026-07-28）

结论：**无 BLOCKER**。红线（重定向 fail-safe、端点鉴权、失败可观测、金额不进日志、迁移可回滚、
不越 Out of Scope）全部核对通过，逐条见下。设计本身已经过两轮 YAGNI 削减（历史表/策略类/
Celery/dry-run 开关等均已在 §4 拒绝），复审未发现新的过度设计可砍——唯一的“简化建议”
（合并 4 个 classify 函数为 1 张表）经复核认为不划算，已放弃，理由见下。复审的主要产出是
**7 处集成细节的精确化**：设计在正确的方向上，但把这些交给下游模型会各自猜出不同答案，
必须钉死。已逐条验证（读真实源码，非凭 DESIGN 复述）。

### 红线核对（逐条通过）

| 红线 | 核对结果 |
|---|---|
| 重定向默认开、缺失/拼错必须仍重定向 | `redirect_enabled()` 仅 `"off"`（strip+casefold）返回 False，其余任何值/None 都重定向 ON——设计正确，STEPS 原样落地 |
| 端点必须鉴权，缺 key 必须 503 | 确认 `hmac.compare_digest` 前必须先判空——STEPS 明确顺序：先查 key 是否配置（否则 503），再比对（不等 401） |
| 失败必须可观测 | 发现设计未言明的漏洞：`notify_sms`/`notify_email`/`_send_service_sms`/`_send_service_email` 均不自行 `db.commit()`（读 `notification_service.py` 全文确认，EV 侧惯例是调用方在 request 尾部统一 commit，如 `cases.py:87`）。若 `run_daily_nudges` 只在整批扫描结束时提交一次，跑到一半崩溃会丢失已发送但未落库的 `notifications` 行——下次跑（含同日 16:00/17:00 双 cron 条目，天天都会触发这个窗口)会误判"今天没催过"从而**重复发送真实短信**。**已在 STEPS 钉死：`_deliver_customer_sms`/`_deliver_digest_email` 各自在 `_record_notification` 后立即 `db.commit()`**，不批量收尾提交。此为本次复审最重要的发现。 |
| 金额不进日志明文 | 复用的 `logger.warning(...)` 只记 `case_id/template_name/error`，催单 SMS 模板本身不含金额——通过 |
| 迁移可回滚，回填不提前误催 | 发现设计遗漏：`service_bookings.updated_at`/`created_at` 在 `b1c2d3e4f5a6` 建表时**未标 `nullable=False`**，直接 `UPDATE ... SET status_changed_at = updated_at` 后 `SET NOT NULL` 遇到任何 NULL 行会迁移失败。**已在 STEPS 改为 `COALESCE(updated_at, created_at, now())`**。downgrade() 需回退新增两列——已列入步骤。 |
| 不越 Out of Scope（无后台 UI/退订链接/多语言/新常驻进程/改现有通知触发逻辑） | 逐条核对 DESIGN 全文，无违反。§6 提到"若催满 3 次会给 FFT-2026-0002 写 CaseNote"看似碰了"不动 FFT-2026-0002 业务数据"——复核后认为不冲突：该 Out of Scope 条款约束的是本次开发**不得为该单手工补录/修改历史数据**，不是让自动化引擎豁免这张真实单（豁免会直接违背 SPEC 问题陈述本身——Raju 停滞 28 天无人发现正是本功能的立项理由）。CaseNote 只在催满 3 次仍停滞（约 42+ 天后）才写，且生产环境重定向默认 ON 使 Raju 本人绝不会收到短信。判定：不是违规，已在 STEPS 保留并注明依据。 |

### 过度设计核查（无新增删除项）

架构师已在 §4 拒绝了历史表、每单计数字段、策略类分层、Celery/APScheduler、dry-run 参数等
六项更贵方案，复审同意全部否决理由，未发现设计里还藏着别的投机通用化。唯一考虑过的简化——
把 `classify_ev`/`classify_service`/`classify_cleaning` 合并成一张统一 dict 分派表——评估后
**放弃**：清洁订阅的键是 `(pricing_status, payment_status)` 二元组，EV/服务单是单一枚举，强行
合并需要发明一层归一化，体积没有变小、边界反而更容易出错，且会改动 Kuo 已在闸 2 批准的设计
结构。省下的力气改用在穷举测试上（§5 测试接缝 1 已经要求，STEPS 原样保留）。

### 并行拆分核查

DESIGN §5 已声明 T1→T2→T3 全串行、不设 PARALLEL-SAFE，理由（T3 的全部价值在于调 T2 接口，
独立并行收益不值集成风险）成立，复审同意，无需降级（本来就是最保守档）。

### 需精确化的集成细节（钉死进 STEPS，逐条已用真实源码验证）

1. **`_mark_status_changed` 真实调用点 = 7 处，不是 DESIGN §5 写的“8 个函数”**：
   `service_bookings.status` 的赋值语句只有 5 处（`admin_schedule_booking`/
   `admin_create_bird_quote`/`approve_bird_quote`/`admin_update_status`/`cancel_booking`），
   `cleaning_subscriptions` 的相关赋值只有 2 处（`admin_set_cleaning_price`/
   `admin_set_cleaning_payment`）；两个 `create_*` 函数是新建行，`status_changed_at` 靠
   `server_default=now()` 自动对齐 `created_at`，**不需要**调用该 helper。已用
   `grep '\.status\s*='` 等模式扫过 `backend/app` 全目录（含 `admin/services.py`，它只读/过滤
   状态、从不直接赋值，所有写入都经 `service_booking_flow.py`），确认没有遗漏的写入点——
   DESIGN 关于"全部集中在一个文件"的断言属实。
2. **摘要邮件的无 FK Notification 行，必须用 `_send_service_email(..., service_booking_id=None,
   cleaning_subscription_id=None)`，不是 `notify_email(case_id=None)`**：`notify_email` 签名
   要求 `case_id: str`（非 Optional），传 None 虽运行时不报错但类型契约不成立；
   `_send_service_email` 两个 FK 形参本就是 `str | None`，传两个 None 恰好产出设计要的无 FK 行。
3. **摘要邮件渲染复用 `notification_service.py` 的私有函数**（`_get_system_setting` /
   `_templates_env` / `_with_brand_profile`），因为唯一的公共"DB 模板或回退"邮件函数
   `render_email_from_db_or_files` 的回退分支要求一个**文件**模板，会多出一个不必要的
   `.html` 文件依赖。跨模块引用私有符号在本仓库有先例（`branding.py` 已导入
   `_absolute_logo_url`），T2 的文件集不含 `notification_service.py` 也不需要改它。
4. **测试执行方式 = 仿 `test_booking_logic.py`，不是 pytest fixture**：backend 镜像
   `requirements.txt` 没装 pytest，`docker-compose.test.yml` 的独立 `tests` 容器没有
   SQLAlchemy/psycopg2 也没拷 `app/` 目录（只能跑纯 httpx 集成测试，够不到 DB）。真正能拿到
   `Session` 直连 DB 的方式，是 `docker-compose.dev.yml` bind-mount 的本地 backend 容器
   （`./backend:/app`，`DB_HOST=db` 已配好），用 assert + `if __name__ == "__main__"` 的纯脚本
   风格（同 `test_booking_logic.py`），`docker exec` 进去跑，**不 `import pytest`**。
5. **`docker-compose.test.yml` 需要补一个环境变量才能测通端点**：T3 想用现有 httpx 风格测 200/401
   两个分支，`tests`/`backend` 服务当前都没设 `NUDGE_RUN_KEY`，导致端点恒 503。已把
   `docker-compose.test.yml` 加进 T3 的文件集（一行 env 增补），"缺 key→503" 分支改为部署 runbook
   里的一次手工检查（临时注释掉 env 重启验证），不为它单独起第二套 stack——比例合适。
6. **迁移回填的空值兜底**：见上表红线核对。
7. **两个 VPS 迁移的先后风险**：MEMORY 记录 v3.0（迁移 `b1c2d3e4f5a6`）从未上过生产。VPS 部署
   本次改动时，`alembic upgrade head` 可能连带把 `b1c2d3e4f5a6` 一起打上去（它含
   `ALTER TYPE ... ADD VALUE` 的 autocommit 块）——runbook 明确要求先在 VPS 做一次干跑
   （复制生产库到临时库跑 `upgrade head`）确认两个迁移都过，而不是直接对生产库跑。

以上 7 点均不改变 DESIGN 的方案选择或红线结论，只是把"怎么接到现有代码"钉死到不会被
下游模型猜歪的颗粒度。可以出 STEPS。
