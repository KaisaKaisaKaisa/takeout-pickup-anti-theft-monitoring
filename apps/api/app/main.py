from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routers import orders, alerts, edge_ingest, evidence, devices, auth, media, users, integrations, config, whitelist, audit, sessions, reports, rules
from app.services.timeout_checker import run_timeout_loop
from app.services.cleanup import run_cleanup_loop
from app.services.device_offline_checker import run_device_offline_loop
from app.core import ws as ws_hub
from app.core.config import settings

app = FastAPI(title="Takeout Guard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def normalize_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(integrations.router, prefix="/api/v1/integrations", tags=["integrations"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(whitelist.router, prefix="/api/v1/whitelist", tags=["whitelist"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["audit"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(rules.router, prefix="/api/v1/rules", tags=["rules"])

@app.on_event("startup")
async def startup() -> None:
    if not settings.run_background_tasks:
        return
    import asyncio
    asyncio.create_task(run_timeout_loop())
    asyncio.create_task(run_cleanup_loop())
    asyncio.create_task(run_device_offline_loop())
app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
app.include_router(devices.router, prefix="/api/v1/devices", tags=["devices"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(edge_ingest.router, prefix="/api/v1/edge", tags=["edge"])
app.include_router(media.router, prefix="/api/v1/media", tags=["media"])

@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await ws.accept()
    await ws_hub.register(ws)
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = msg and msg.strip()
                if data and data.startswith("{"):
                    import json
                    payload = json.loads(data)
                    topics = payload.get("subscribe")
                    if isinstance(topics, list):
                        ws_hub.update_subscription(ws, topics)
            except Exception:
                pass
    except WebSocketDisconnect:
        await ws_hub.unregister(ws)
