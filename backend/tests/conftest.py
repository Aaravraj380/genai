"""Test fixtures: every test gets a brand-new app with its own SQLite file."""

from __future__ import annotations

import itertools
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

_emails = itertools.count(1)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}", secret_key="t" * 48)


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def signup(client) -> Callable[..., dict]:
    """Create a user; returns {"headers", "token", "user", "email", "password"}."""

    def _signup(email: str | None = None, password: str = "secret123", name: str = "Test User") -> dict:
        email = email or f"user{next(_emails)}@example.com"
        r = client.post("/auth/signup", json={"email": email, "password": password, "name": name})
        assert r.status_code == 201, r.text
        body = r.json()
        return {
            "headers": {"Authorization": f"Bearer {body['accessToken']}"},
            "token": body["accessToken"],
            "user": body["user"],
            "email": email,
            "password": password,
        }

    return _signup


@pytest.fixture
def auth(signup) -> dict[str, str]:
    """Headers for one logged-in user."""
    return signup()["headers"]


def habit_json(**over) -> dict:
    """A valid habit exactly as the app sends it."""
    base = {
        "title": "Read 20 pages",
        "frequency": {"type": "daily"},
        "creationDate": "2026-09-01",
        "createdAt": "2026-09-01T08:00:00.000Z",
        "icon": "reading",
        "color": "#4EDEA3",
        "category": "Learning",
        "targetPerDay": 1,
        "pauses": [],
    }
    base.update(over)
    return base
