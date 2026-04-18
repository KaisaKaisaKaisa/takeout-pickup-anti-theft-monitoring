# 外卖取餐防盗全链路监控

外卖取餐防盗全链路监控系统，覆盖后端 API、边缘设备代理、PWA 前端、部署脚本、数据库设计、接口文档和演示站点素材。

## 仓库分类

- `apps/api`：FastAPI 后端，包含规则引擎、告警、审计、报表、设备配置等能力
- `apps/edge-agent`：边缘侧代理，包含摄像头守护、运动检测、称重传感器、离线队列与配置同步
- `apps/pwa`：PWA 控制台与前端测试
- `docs`：架构、部署、OpenAPI、数据库设计、方案说明、补充设计稿与截图
- `infra/compose`：本地联调用 Docker Compose
- `scripts`：初始化数据库、模拟流程、生成 VAPID、启动开发环境等脚本
- `sites`：独立静态展示站与样例页面

## 目录整理说明

- 根目录中的展示页与静态资源已归档到 `sites/showcase`
- PWA 视觉稿截图已归档到 `docs/screenshots`
- 本地调试临时文件已迁移到 `.local/diagnostics` 并默认忽略
- `.env` 为本地私密配置，不会提交；参考配置见 `.env.example`

## 快速启动

### 1. 启动基础依赖

```powershell
cd infra/compose
docker compose up -d
```

### 2. 启动 API

```powershell
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 18000
```

### 3. 启动 PWA

```powershell
powershell .\scripts\run_pwa.ps1
```

### 4. 初始化演示数据

```powershell
python .\scripts\init_db.py
python .\scripts\simulate_flow.py
```

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
- `docs/schema.sql`
- `docs/solution.md`
- `docs/spec.md`

## 备注

- `sites/aura`、`sites/svganimate`、`sites/showcase` 为独立静态页面样例，不影响主业务系统运行
- `docs/superpowers` 保存了阶段性设计与计划文档，便于追踪演进过程
