"""Accounts: sign-up, login, tokens, brute-force protection, profile, password, deletion."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app import models as m
from app.security import create_access_token

from .conftest import habit_json

# ----------------------------------------------------------------- sign up --


def test_signup_returns_token_and_normalised_user(client):
    r = client.post("/auth/signup", json={"email": "  Aarav@Example.COM ", "password": "secret123", "name": "  Aarav  "})
    assert r.status_code == 201
    body = r.json()
    assert body["tokenType"] == "bearer"
    assert body["expiresIn"] == 30 * 24 * 3600
    assert body["user"]["email"] == "aarav@example.com"
    assert body["user"]["name"] == "Aarav"
    assert set(body["user"]) == {"id", "email", "name", "createdAt"}  # never leaks the password hash
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"})
    assert me.status_code == 200 and me.json()["email"] == "aarav@example.com"


def test_password_is_stored_hashed(client, signup, app):
    signup(email="hash@example.com", password="secret123")
    with app.state.db.SessionLocal() as db:
        stored = db.scalar(select(m.User.password_hash))
    assert stored.startswith("$argon2") and "secret123" not in stored


def test_duplicate_email_is_rejected_case_insensitively(client, signup):
    signup(email="dup@example.com")
    r = client.post("/auth/signup", json={"email": "DUP@example.com", "password": "secret123", "name": "X"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


@pytest.mark.parametrize(
    "body, field",
    [
        ({"email": "not-an-email", "password": "secret123", "name": "A"}, "email"),
        ({"email": "a@example.com", "password": "short1", "name": "A"}, "password"),
        ({"email": "a@example.com", "password": "onlyletters", "name": "A"}, "password"),
        ({"email": "a@example.com", "password": "12345678", "name": "A"}, "password"),
        ({"email": "a@example.com", "password": "x" * 120 + "1" * 9, "name": "A"}, "password"),
        ({"email": "a@example.com", "password": "secret123", "name": "   "}, "name"),
        ({"email": "a@example.com", "password": "secret123", "name": "n" * 41}, "name"),
        ({"email": "a@example.com", "password": "secret123"}, "name"),
        ({}, "email"),
    ],
)
def test_signup_validation(client, body, field):
    r = client.post("/auth/signup", json=body)
    assert r.status_code == 422
    assert any(field in err["loc"] for err in r.json()["detail"])


def test_signup_rejects_non_json(client):
    r = client.post("/auth/signup", content="hello", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


# ------------------------------------------------------------------- login --


def test_login_success_and_case_insensitive_email(client, signup):
    signup(email="login@example.com", password="secret123")
    r = client.post("/auth/login", json={"email": "LOGIN@example.com ", "password": "secret123"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "login@example.com"


def test_wrong_password_and_unknown_email_look_identical(client, signup):
    signup(email="who@example.com")
    wrong = client.post("/auth/login", json={"email": "who@example.com", "password": "nope1234"})
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope1234"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Wrong email or password"}


def test_login_lockout_after_repeated_failures(client, signup):
    signup(email="lock@example.com", password="secret123")
    for _ in range(5):
        assert client.post("/auth/login", json={"email": "lock@example.com", "password": "bad"}).status_code == 401
    blocked = client.post("/auth/login", json={"email": "lock@example.com", "password": "secret123"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # Other accounts are unaffected.
    signup(email="free@example.com", password="secret123")
    assert client.post("/auth/login", json={"email": "free@example.com", "password": "secret123"}).status_code == 200


def test_successful_login_resets_failure_count(client, signup):
    signup(email="reset@example.com", password="secret123")
    for _ in range(4):
        client.post("/auth/login", json={"email": "reset@example.com", "password": "bad"})
    assert client.post("/auth/login", json={"email": "reset@example.com", "password": "secret123"}).status_code == 200
    for _ in range(4):
        client.post("/auth/login", json={"email": "reset@example.com", "password": "bad"})
    assert client.post("/auth/login", json={"email": "reset@example.com", "password": "secret123"}).status_code == 200


def test_oauth2_form_login_for_docs(client, signup):
    signup(email="form@example.com", password="secret123")
    r = client.post("/auth/token", data={"username": "Form@Example.com", "password": "secret123"})
    assert r.status_code == 200 and r.json()["accessToken"]


# ------------------------------------------------------------------ tokens --


@pytest.mark.parametrize(
    "header",
    [None, "Bearer", "Bearer not.a.jwt", "Basic dXNlcjpwYXNz", "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0."],
)
def test_protected_routes_need_a_valid_token(client, header):
    headers = {"Authorization": header} if header else {}
    for method, url in [("get", "/auth/me"), ("get", "/habits"), ("get", "/sync"), ("get", "/settings")]:
        r = getattr(client, method)(url, headers=headers)
        assert r.status_code == 401, (url, header)
        assert r.headers["WWW-Authenticate"] == "Bearer"


def test_expired_token_is_rejected(client, signup, settings):
    user = signup()["user"]
    token, _ = create_access_token(user["id"], 0, settings.secret_key, days=-1)
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and "log in again" in r.json()["detail"]


def test_token_signed_with_another_key_is_rejected(client, signup):
    user = signup()["user"]
    token, _ = create_access_token(user["id"], 0, "attacker-secret" * 4, days=1)
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_for_another_user_id_cannot_be_forged(client, signup, settings):
    signup()
    token, _ = create_access_token(999, 0, settings.secret_key, days=1)  # user doesn't exist
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# --------------------------------------------------------- profile/password --


def test_update_profile_name(client, auth):
    r = client.patch("/auth/me", json={"name": "  New Name "}, headers=auth)
    assert r.status_code == 200 and r.json()["name"] == "New Name"
    assert client.patch("/auth/me", json={"name": ""}, headers=auth).status_code == 422


def test_change_password_logs_out_other_devices(client, signup):
    u = signup(email="pw@example.com", password="secret123")
    other_device = client.post("/auth/login", json={"email": "pw@example.com", "password": "secret123"}).json()
    assert client.post(
        "/auth/change-password", json={"currentPassword": "wrong123", "newPassword": "newpass456"}, headers=u["headers"]
    ).status_code == 403
    r = client.post("/auth/change-password", json={"currentPassword": "secret123", "newPassword": "newpass456"}, headers=u["headers"])
    assert r.status_code == 200
    new_headers = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    assert client.get("/auth/me", headers=new_headers).status_code == 200
    assert client.get("/auth/me", headers=u["headers"]).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {other_device['accessToken']}"}).status_code == 401
    assert client.post("/auth/login", json={"email": "pw@example.com", "password": "secret123"}).status_code == 401
    assert client.post("/auth/login", json={"email": "pw@example.com", "password": "newpass456"}).status_code == 200


def test_change_password_enforces_strength(client, auth):
    r = client.post("/auth/change-password", json={"currentPassword": "secret123", "newPassword": "weak"}, headers=auth)
    assert r.status_code == 422


def test_logout_everywhere(client, signup):
    u = signup()
    assert client.post("/auth/logout-all", headers=u["headers"]).status_code == 204
    assert client.get("/auth/me", headers=u["headers"]).status_code == 401
    assert client.post("/auth/login", json={"email": u["email"], "password": u["password"]}).status_code == 200


# ----------------------------------------------------------------- delete --


def test_delete_account_removes_everything(client, signup, app):
    u = signup(email="bye@example.com")
    h = u["headers"]
    client.put("/habits/h1", json=habit_json(), headers=h)
    client.put("/habits/h1/completions/2026-09-02", json={"count": 1}, headers=h)
    client.put("/habits/h1/freezes/2026-09-03", headers=h)
    client.patch("/settings", json={"language": "hi"}, headers=h)
    keep = signup()  # another user's data must survive
    client.put("/habits/h1", json=habit_json(), headers=keep["headers"])

    assert client.request("DELETE", "/auth/me", json={"password": "wrong123"}, headers=h).status_code == 403
    assert client.request("DELETE", "/auth/me", headers=h).status_code == 422  # password is required
    assert client.request("DELETE", "/auth/me", json={"password": "secret123"}, headers=h).status_code == 204
    assert client.get("/auth/me", headers=h).status_code == 401

    with app.state.db.SessionLocal() as db:
        counts = {t.__tablename__: db.scalar(select(func.count()).select_from(t)) for t in (m.User, m.Habit, m.Completion, m.Freeze, m.UserSettings)}
    assert counts == {"users": 1, "habits": 1, "completions": 0, "freezes": 0, "user_settings": 0}
    # The email can be used again.
    assert client.post("/auth/signup", json={"email": "bye@example.com", "password": "secret123", "name": "Back"}).status_code == 201
