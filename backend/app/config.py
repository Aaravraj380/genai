"""Application settings, read from environment variables or `backend/.env`.

Every value has a safe default, so the server runs with zero configuration.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Focus & Flow API"
    #: SQLAlchemy URL. Default: a SQLite file at backend/data/focus_flow.db
    database_url: str = f"sqlite:///{(DATA_DIR / 'focus_flow.db').as_posix()}"
    #: Key used to sign login tokens. If empty, one is generated once and kept in data/secret.key.
    secret_key: str = ""
    #: How long a login lasts on a device.
    access_token_days: int = 30
    #: Comma-separated list of allowed web origins, or "*" (fine here: auth uses tokens, not cookies).
    cors_origins: str = "*"
    #: Brute-force protection: failed logins allowed per email+IP within the window.
    login_max_attempts: int = 5
    login_window_seconds: int = 300

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()] or ["*"]


def _load_or_create_secret() -> str:
    """Keep the signing key stable across restarts so users stay logged in."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = DATA_DIR / "secret.key"
    if key_file.exists():
        return key_file.read_text(encoding="utf-8").strip()
    key = secrets.token_urlsafe(48)
    key_file.write_text(key, encoding="utf-8")
    return key


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.secret_key:
        settings.secret_key = _load_or_create_secret()
    if settings.database_url.startswith("sqlite:///"):
        Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    return settings
