"""app.py — FastAPI application factory."""

import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import cluster, cluster_profile, config, download, export, infer, models, reconstruct, status, train, windows
from services import config_manager, log_control
from websocket.live import heartbeat_loop, ws_endpoint


def _configure_logging() -> None:
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {"format": "%(asctime)s %(levelname)-8s %(name)s: %(message)s"},
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "default"},
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    })
    # File handler owned by log_control so it can be toggled at runtime
    cfg = config_manager.load()
    log_control.setup(cfg.get("logging_enabled", True))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    logging.getLogger(__name__).info("v2 backend starting — config loaded from %s", config_manager._CONFIG_PATH)
    import asyncio
    task = asyncio.create_task(heartbeat_loop())
    yield
    task.cancel()


app = FastAPI(title="1DCNN-A v2", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(config.router)
app.include_router(status.router)
app.include_router(download.router)
app.include_router(models.router)
app.include_router(train.router)
app.include_router(infer.router)
app.include_router(cluster.router)
app.include_router(cluster_profile.router)
app.include_router(export.router)
app.include_router(windows.router)
app.include_router(reconstruct.router)

# WebSocket
app.add_api_websocket_route("/ws", ws_endpoint)
