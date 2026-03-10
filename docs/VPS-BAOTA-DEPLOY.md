# VPS 部署（宝塔 + 单域名 /admin）

目标：

- 用户端：`https://evquote.khtain.com/`
- Admin：`https://evquote.khtain.com/admin/`
- API：`https://evquote.khtain.com/api/`
- Uploads：`https://evquote.khtain.com/uploads/`

本项目推荐：**宝塔 Nginx 负责 HTTPS + 路由**，Docker 服务只绑定到 `127.0.0.1`（不暴露公网端口）。

---

## 1) DNS

为 `evquote.khtain.com` 添加：

- A 记录 → VPS 公网 IP

（如有 IPv6，再加 AAAA）

---

## 2) VPS 环境准备

- 安装 Docker + docker compose
- 服务器放行：**80/443**（其余端口不需要对公网开放）

---

## 3) 拉取代码

```bash
git clone https://github.com/bkcsplayer/fft-evquote-helper.git
cd fft-evquote-helper
```

---

## 4) 配置 `.env`

复制并编辑：

```bash
cp .env.example .env
```

建议最少修改：

- `APP_ENV=production`
- `SECRET_KEY=...`（强随机）
- `DB_PASSWORD=...`（强随机）
- `FRONTEND_URL=https://evquote.khtain.com`
- `ADMIN_URL=https://evquote.khtain.com`（注意：不要写 `/admin`）
- SMTP/Twilio（可选）
- 首次创建管理员（强烈建议设置一次性 bootstrap）：
  - `BOOTSTRAP_ADMIN_USERNAME=admin`
  - `BOOTSTRAP_ADMIN_EMAIL=你的邮箱`
  - `BOOTSTRAP_ADMIN_PASSWORD=强密码`

> 系统会在“库里还没有任何 admin user”时创建一次；你确认能登录后，可以把 `BOOTSTRAP_ADMIN_*` 从 `.env` 删除。

---

## 5) 启动 Docker（VPS 模式）

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env up -d --build
```

本模式端口绑定：

- `127.0.0.1:7220` → frontend
- `127.0.0.1:7221` → admin
- `127.0.0.1:7222` → backend
- DB 不暴露端口

---

## 6) 宝塔 Nginx 反向代理（站点：evquote.khtain.com）

在宝塔站点配置里加入（或用“反向代理”界面配置等价规则）：

```nginx
client_max_body_size 25m;

location /admin/ {
  proxy_pass http://127.0.0.1:7221;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location = /admin { return 301 /admin/; }

location /api/ {
  proxy_pass http://127.0.0.1:7222;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /uploads/ {
  proxy_pass http://127.0.0.1:7222;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
  proxy_pass http://127.0.0.1:7220;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

如果你希望直接复制完整站点配置文件，可以参考仓库里的：

- `docs/BAOTA-NGINX-evquote.khtain.com.conf`

然后宝塔申请并启用 **Let’s Encrypt**，强制 HTTPS。

---

## 7) 验证

- 用户端：`https://evquote.khtain.com/quote`
- Admin：`https://evquote.khtain.com/admin/`
- API Docs（建议仅管理员访问）：`https://evquote.khtain.com/api/docs`

---

## 8) 更新发布

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env up -d --build
```

