"""Server-level behaviour: health, docs, CORS, persistence across restarts."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

from .conftest import habit_json


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["database"] == "ok" and body["app"] == "focus-flow"


def test_root_redirects_to_docs(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/docs"
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/auth/signup", "/auth/login", "/habits/{habit_id}", "/sync", "/sync/push", "/sync/merge", "/settings"} <= set(paths)


def test_cors_allows_the_expo_web_app(client):
    r = client.options(
        "/habits",
        headers={"Origin": "http://localhost:8081", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] in ("*", "http://localhost:8081")
    assert client.get("/health", headers={"Origin": "http://192.168.1.20:8081"}).headers["access-control-allow-origin"] == "*"


def test_unknown_route_and_wrong_method(client, auth):
    assert client.get("/nope").status_code == 404
    assert client.post("/habits", json={}, headers=auth).status_code == 405


def test_data_and_logins_survive_a_server_restart(tmp_path):
    settings = Settings(database_url=f"sqlite:///{(tmp_path / 'live.db').as_posix()}", secret_key="k" * 48)
    with TestClient(create_app(settings)) as c:
        token = c.post("/auth/signup", json={"email": "r@example.com", "password": "secret123", "name": "R"}).json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}
        c.put("/habits/h1", json=habit_json(), headers=headers)
        c.put("/habits/h1/completions/2026-09-02", json={"count": 1}, headers=headers)
    with TestClient(create_app(settings)) as c:  # "restart"
        assert c.get("/auth/me", headers=headers).status_code == 200  # still logged in
        assert c.get("/habits/h1/log", headers=headers).json()["completions"] == {"2026-09-02": 1}


def test_foreign_keys_are_enforced(app, client, auth):
    """Deleting a habit at the SQL level must cascade (PRAGMA foreign_keys is on)."""
    from sqlalchemy import text

    client.put("/habits/h1", json=habit_json(pauses=[{"start": "2026-09-05"}]), headers=auth)
    client.put("/habits/h1/completions/2026-09-02", json={"count": 1}, headers=auth)
    with app.state.db.engine.begin() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
        conn.execute(text("DELETE FROM habits"))
        assert conn.execute(text("SELECT COUNT(*) FROM completions")).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM pauses")).scalar() == 0
