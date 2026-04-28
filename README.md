# 外卖围栏取餐准入与防盗留痕

外卖围栏取餐准入与防盗留痕系统，覆盖后端 API、入口取餐码核验、PWA 前端、微信小程序 web-view 适配、边缘设备辅助取证、部署脚本、数据库设计、接口文档和演示站点素材。

## 仓库分类

- `apps/api`：FastAPI 后端，包含入口取餐码核验、规则引擎、告警、审计、报表、设备配置等能力
- `apps/edge-agent`：边缘侧代理，包含摄像头守护、运动检测、称重传感器、离线队列与配置同步
- `apps/pwa`：PWA 控制台、入口核验页 `/gate`、学生取餐码页 `/pickup` 与前端测试
- `docs`：架构、部署、OpenAPI、数据库摘要、方案说明、补充设计稿与截图
- `infra/compose`：本地联调用 Docker Compose
- `scripts`：初始化数据库、模拟流程、生成 VAPID、启动开发环境等脚本
- `sites`：独立静态展示站与样例页面

## 目录整理说明

- 根目录中的展示页与静态资源已归档到 `sites/showcase`
- PWA 视觉稿截图已归档到 `docs/screenshots`
- 本地调试临时文件已迁移到 `.local/diagnostics` 并默认忽略
- `.env` 为本地私密配置，不会提交；参考配置见 `.env.example`

## 快速启动

### 0. 一键打开前端网站

在资源管理器中双击根目录的 `open-website.bat`。

该入口会启动 PWA 的 Vite 开发服务并自动打开 `http://127.0.0.1:5173`。服务窗口需要保持打开；关闭该窗口后网站会停止。后续修改 `apps/pwa` 前端代码后，浏览器刷新或 Vite 热更新即可看到变化。

### 1. 一键启动本地联调环境

```powershell
powershell .\scripts\dev_up.ps1
```

该命令通过 Docker Compose 启动 PostgreSQL、Redis、MinIO、API、worker 和 PWA 静态服务。API 容器启动前会执行 Alembic 迁移；所有建表、索引和字段变更都以 `apps/api/migrations` 为准。

### 2. 单独启动 PWA

```powershell
powershell .\scripts\run_pwa.ps1
```

移动端入口：

- 工作人员入口核验页：`/gate`
- 学生取餐码页：`/pickup`

这两个页面是同一套 H5/PWA 页面，可在浏览器访问，也可由微信小程序 `web-view` 承载。正式接入微信小程序时，需要使用 HTTPS 备案域名，并在小程序后台配置业务域名。

### 3. 初始化或升级数据库

```powershell
python .\scripts\init_db.py
```

`scripts/init_db.py` 现在只代理执行 `apps/api` 下的 `alembic upgrade head`，用于本地非 compose 场景。

### 4. 初始化演示数据

```powershell
python .\scripts\simulate_flow.py
```

运行前请确认 API 已在 `http://localhost:18000` 就绪。

## 环境变量

复制 `.env.example` 作为本地环境模板，按实际数据库、Redis、JWT、Webhook、推送配置填写。

关键变量包括：

- `DB_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `LOCAL_MEDIA_ROOT`
- `PROVIDER_WEBHOOK_SECRET` 或 `PROVIDER_WEBHOOK_SECRETS`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`

## 边缘侧脚本

- 摄像头守护：`python .\apps\edge-agent\agent\camera_guard.py`
- 运动检测：`python .\apps\edge-agent\agent\motion_detector.py`
- 称重传感器：`python .\apps\edge-agent\agent\weight_sensor.py`
- 树莓派 GPIO 称重：`python .\apps\edge-agent\agent\weight_sensor_gpio.py`
- 配置同步：`python .\apps\edge-agent\agent\config_client.py`

## 主要文档

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/openapi.yaml`
- `apps/api/migrations`
- `docs/schema.sql`（历史 schema 快照，仅供阅读，不作为迁移入口）
- `docs/solution.md`
- `docs/spec.md`

## 备注

- `sites/aura`、`sites/svganimate`、`sites/showcase` 为独立静态页面样例，不影响主业务系统运行
- `docs/superpowers` 保存了阶段性设计与计划文档，便于追踪演进过程
