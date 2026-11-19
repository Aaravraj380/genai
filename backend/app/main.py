"""Focus & Flow API — FastAPI application.

Run (from the backend folder, with the virtual environment active):

    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

or simply `python run.py`, which also prints the address to use on your phone.
Interactive docs: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
import socket
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from . import __version__
from .config import Settings, get_settings
from .db import Database
from .routers import auth, habits, sync
from .security import LoginLimiter

log = logging.getLogger("focus_flow")


def lan_ip() -> str | None:
    """This computer's address on the Wi-Fi network (what the phone must use)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the outgoing interface
            ip = s.getsockname()[0]
            return None if ip.startswith("127.") else ip
    except OSError:
        return None


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    database = Database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.create_all()
        ip = lan_ip()
        log.info("Focus & Flow API ready. Phone/Expo Go: http://%s:8000   Docs: http://localhost:8000/docs", ip or "<your-PC-IP>")
        yield
        database.engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        summary="Accounts and cross-device sync for the Focus & Flow habit tracker.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.db = database
    app.state.login_limiter = LoginLimiter(settings.login_max_attempts, settings.login_window_seconds)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,  # tokens travel in the Authorization header, not cookies
        expose_headers=["Retry-After"],
    )

    @app.exception_handler(SQLAlchemyError)
    async def db_error(_request: Request, exc: SQLAlchemyError):
        log.exception("database error", exc_info=exc)
        return JSONResponse(status_code=503, content={"detail": "Database error — please try again"})

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/docs")

    @app.get("/health", tags=["meta"])
    def health():
        """Used by the app to check that it can reach the server."""
        ok = True
        try:
            with database.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except SQLAlchemyError:
            ok = False
        return {
            "status": "ok" if ok else "degraded",
            "app": "focus-flow",
            "version": __version__,
            "database": "ok" if ok else "unavailable",
            "serverTime": datetime.now(UTC).isoformat(),
        }

    app.include_router(auth.router)
    app.include_router(habits.router)
    app.include_router(sync.settings_router)
    app.include_router(sync.router)
    return app


app = create_app()
