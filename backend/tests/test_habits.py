"""Habits, check-offs, freezes, settings and per-user isolation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from .conftest import habit_json

FULL = habit_json(
    title="Meditate",
    frequency={"type": "custom", "days": [1, 3, 5]},
    icon="mind",
    color="#ffb4ab",
    category="Mindfulness",
    note="It’s \"quoted\"; DROP TABLE habits; --",
    targetPerDay=3,
    reminder={"enabled": True, "hour": 7, "minute": 5, "message": "নমস্কার! Time to go"},
    pauses=[{"start": "2026-09-10", "end": "2026-09-12"}, {"start": "2026-09-20"}],
    templateKey="meditation",
)


def utc_day(offset: int = 0) -> str:
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


# ------------------------------------------------------------------ CRUD --


def test_create_then_read_round_trips_every_field(client, auth):
    r = client.put("/habits/kx3-ab12", json=FULL, headers=auth)
    assert r.status_code == 201
    got = client.get("/habits/kx3-ab12", headers=auth).json()
    expected = {**FULL, "id": "kx3-ab12", "sortOrder": 0}
    assert got == expected
    assert client.get("/habits", headers=auth).json() == [expected]


def test_put_again_updates_in_place(client, auth):
    client.put("/habits/h1", json=FULL, headers=auth)
    changed = {**FULL, "title": "Meditate 10 min", "reminder": None, "note": "", "pauses": []}
    r = client.put("/habits/h1", json=changed, headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Meditate 10 min"
    assert "reminder" not in body and "note" not in body and body["pauses"] == []
    assert len(client.get("/habits", headers=auth).json()) == 1


def test_habits_keep_their_order(client, auth):
    for hid in ["c", "a", "b"]:
        client.put(f"/habits/{hid}", json=habit_json(title=hid), headers=auth)
    assert [h["id"] for h in client.get("/habits", headers=auth).json()] == ["c", "a", "b"]
    client.put("/habits/b", json=habit_json(title="b", sortOrder=0), headers=auth)
    client.put("/habits/c", json=habit_json(title="c", sortOrder=2), headers=auth)
    assert [h["id"] for h in client.get("/habits", headers=auth).json()] == ["b", "a", "c"]


def test_input_is_normalised_like_the_app(client, auth):
    body = habit_json(title="  Run  ", category="  ##Deep   Work ", frequency={"type": "custom", "days": [5, 1, 5]})
    got = client.put("/habits/h1", json=body, headers=auth).json()
    assert got["title"] == "Run"
    assert got["category"] == "Deep Work"
    assert got["frequency"] == {"type": "custom", "days": [5, 1]}
    # days are ignored for non-custom frequencies
    got = client.put("/habits/h1", json=habit_json(frequency={"type": "weekdays", "days": [0]}), headers=auth).json()
    assert got["frequency"] == {"type": "weekdays"}


def test_id_in_body_must_match_url(client, auth):
    r = client.put("/habits/h1", json={**habit_json(), "id": "h2"}, headers=auth)
    assert r.status_code == 422
    assert client.put("/habits/h1", json={**habit_json(), "id": "h1"}, headers=auth).status_code == 201


@pytest.mark.parametrize("bad_id", ["has space", "x" * 65, "semi;colon", "slash%2Fid", "é"])
def test_invalid_habit_ids(client, auth, bad_id):
    assert client.put(f"/habits/{bad_id}", json=habit_json(), headers=auth).status_code in (404, 422)


@pytest.mark.parametrize(
    "override",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "t" * 61},
        {"color": "green"},
        {"color": "#12345"},
        {"icon": "rocket"},
        {"targetPerDay": 0},
        {"targetPerDay": 21},
        {"targetPerDay": "three"},
        {"frequency": {"type": "custom", "days": []}},
        {"frequency": {"type": "custom", "days": [7]}},
        {"frequency": {"type": "hourly"}},
        {"creationDate": "2026-02-30"},
        {"creationDate": "26-09-01"},
        {"creationDate": "1999-12-31"},
        {"pauses": [{"start": "2026-09-10", "end": "2026-09-10"}]},
        {"pauses": [{"start": "2026-09-10", "end": "2026-09-01"}]},
        {"reminder": {"enabled": True, "hour": 24, "minute": 0}},
        {"reminder": {"enabled": True, "hour": 8, "minute": 60}},
        {"reminder": {"enabled": True, "hour": 8, "minute": 0, "message": "m" * 81}},
        {"category": "###"},
        {"category": "c" * 21},
        {"note": "n" * 41},
        {"createdAt": ""},
    ],
)
def test_habit_validation(client, auth, override):
    r = client.put("/habits/h1", json=habit_json(**override), headers=auth)
    assert r.status_code == 422, override
    assert client.get("/habits", headers=auth).json() == []  # nothing half-written


@pytest.mark.parametrize("missing", ["title", "frequency", "creationDate", "createdAt", "icon", "color", "category"])
def test_required_fields(client, auth, missing):
    body = habit_json()
    del body[missing]
    assert client.put("/habits/h1", json=body, headers=auth).status_code == 422


def test_delete_is_idempotent_and_removes_history(client, auth):
    client.put("/habits/h1", json=habit_json(), headers=auth)
    client.put("/habits/h1/completions/2026-09-02", json={"count": 1}, headers=auth)
    assert client.delete("/habits/h1", headers=auth).status_code == 204
    assert client.delete("/habits/h1", headers=auth).status_code == 204
    assert client.get("/habits/h1", headers=auth).status_code == 404
    assert client.get("/habits/h1/log", headers=auth).status_code == 404
    # Re-creating the same id starts with a clean history.
    client.put("/habits/h1", json=habit_json(), headers=auth)
    assert client.get("/habits/h1/log", headers=auth).json() == {"completions": {}, "frozen": {}}


# ------------------------------------------------------------ check-offs --


def test_completion_counts_and_cap(client, auth):
    client.put("/habits/h1", json=habit_json(targetPerDay=3), headers=auth)
    r = client.put("/habits/h1/completions/2026-09-02", json={"count": 2}, headers=auth)
    assert r.json() == {"habitId": "h1", "date": "2026-09-02", "count": 2, "targetPerDay": 3, "completed": False}
    r = client.put("/habits/h1/completions/2026-09-02", json={"count": 9}, headers=auth)
    assert r.json()["count"] == 3 and r.json()["completed"] is True
    assert client.get("/habits/h1/log", headers=auth).json()["completions"] == {"2026-09-02": 3}
    client.put("/habits/h1/completions/2026-09-02", json={"count": 0}, headers=auth)
    assert client.get("/habits/h1/log", headers=auth).json()["completions"] == {}


def test_delete_completion(client, auth):
    client.put("/habits/h1", json=habit_json(), headers=auth)
    client.put("/habits/h1/completions/2026-09-02", json={"count": 1}, headers=auth)
    assert client.delete("/habits/h1/completions/2026-09-02", headers=auth).status_code == 204
    assert client.delete("/habits/h1/completions/2026-09-02", headers=auth).status_code == 204
    assert client.get("/habits/h1/log", headers=auth).json()["completions"] == {}


@pytest.mark.parametrize("count", [-1, 21, 1.5, "1", None])
def test_completion_count_validation(client, auth, count):
    client.put("/habits/h1", json=habit_json(), headers=auth)
    assert client.put("/habits/h1/completions/2026-09-02", json={"count": count}, headers=auth).status_code == 422


@pytest.mark.parametrize("day", ["2026-13-01", "2026-02-29", "yesterday", "2026-9-2"])
def test_completion_bad_dates(client, auth, day):
    client.put("/habits/h1", json=habit_json(), headers=auth)
    assert client.put(f"/habits/h1/completions/{day}", json={"count": 1}, headers=auth).status_code == 422


def test_leap_day_is_a_real_date(client, auth):
    client.put("/habits/h1", json=habit_json(creationDate="2024-01-01"), headers=auth)
    assert client.put("/habits/h1/completions/2024-02-29", json={"count": 1}, headers=auth).status_code == 200


def test_time_zones_ahead_of_utc_can_log_their_today(client, auth):
    """Someone in UTC+14 is already on 'tomorrow' in UTC — that must be allowed, the day after must not."""
    client.put("/habits/h1", json=habit_json(), headers=auth)
    assert client.put(f"/habits/h1/completions/{utc_day(0)}", json={"count": 1}, headers=auth).status_code == 200
    assert client.put(f"/habits/h1/completions/{utc_day(1)}", json={"count": 1}, headers=auth).status_code == 200
    r = client.put(f"/habits/h1/completions/{utc_day(2)}", json={"count": 1}, headers=auth)
    assert r.status_code == 422 and "future" in r.json()["detail"]


def test_check_off_unknown_habit(client, auth):
    assert client.put("/habits/nope/completions/2026-09-02", json={"count": 1}, headers=auth).status_code == 404


def test_lowering_the_target_caps_existing_counts(client, auth):
    client.put("/habits/h1", json=habit_json(targetPerDay=5), headers=auth)
    client.put("/habits/h1/completions/2026-09-02", json={"count": 4}, headers=auth)
    client.put("/habits/h1/completions/2026-09-03", json={"count": 1}, headers=auth)
    client.put("/habits/h1", json=habit_json(targetPerDay=2), headers=auth)
    assert client.get("/habits/h1/log", headers=auth).json()["completions"] == {"2026-09-02": 2, "2026-09-03": 1}


# --------------------------------------------------------------- freezes --


def test_freeze_rules(client, auth):
    client.put("/habits/h1", json=habit_json(targetPerDay=2), headers=auth)
    assert client.put("/habits/h1/freezes/2026-09-05", headers=auth).status_code == 204
    assert client.put("/habits/h1/freezes/2026-09-05", headers=auth).status_code == 204  # idempotent
    # A partly done day can still be frozen…
    client.put("/habits/h1/completions/2026-09-06", json={"count": 1}, headers=auth)
    assert client.put("/habits/h1/freezes/2026-09-06", headers=auth).status_code == 204
    # …but completing it removes the freeze, and a complete day can't be frozen.
    client.put("/habits/h1/completions/2026-09-06", json={"count": 2}, headers=auth)
    assert client.get("/habits/h1/log", headers=auth).json()["frozen"] == {"2026-09-05": True}
    assert client.put("/habits/h1/freezes/2026-09-06", headers=auth).status_code == 409
    assert client.delete("/habits/h1/freezes/2026-09-05", headers=auth).status_code == 204
    assert client.get("/habits/h1/log", headers=auth).json()["frozen"] == {}
    assert client.put("/habits/nope/freezes/2026-09-05", headers=auth).status_code == 404
    assert client.put("/habits/h1/freezes/2026-02-30", headers=auth).status_code == 422


# -------------------------------------------------------------- settings --


def test_settings_partial_updates(client, auth):
    assert client.get("/settings", headers=auth).json() == {}
    client.patch("/settings", json={"language": "bn", "weekStartsOn": 0}, headers=auth)
    r = client.patch("/settings", json={"theme": "light", "customCategories": [" #Family", "family", "Prayer", "  "]}, headers=auth)
    assert r.json() == {"language": "bn", "weekStartsOn": 0, "theme": "light", "customCategories": ["Family", "Prayer"]}
    assert client.get("/settings", headers=auth).json() == r.json()
    # unknown keys are ignored (older/newer app versions), not stored
    client.patch("/settings", json={"somethingNew": 1, "avatarUri": "file:///x.jpg"}, headers=auth)
    assert client.get("/settings", headers=auth).json() == r.json()


@pytest.mark.parametrize(
    "bad",
    [{"theme": "blue"}, {"language": "fr"}, {"weekStartsOn": 3}, {"freezesPerMonth": 6}, {"freezesPerMonth": -1},
     {"profileName": "p" * 41}, {"customCategories": [f"c{i}" for i in range(101)]}],
)
def test_settings_validation(client, auth, bad):
    assert client.patch("/settings", json=bad, headers=auth).status_code == 422


# ------------------------------------------------------------- isolation --


def test_users_never_see_or_touch_each_others_data(client, signup):
    a, b = signup()["headers"], signup()["headers"]
    client.put("/habits/same-id", json=habit_json(title="A's habit"), headers=a)
    client.put("/habits/same-id/completions/2026-09-02", json={"count": 1}, headers=a)
    client.patch("/settings", json={"language": "hi"}, headers=a)

    assert client.get("/habits", headers=b).json() == []
    assert client.get("/habits/same-id", headers=b).status_code == 404
    assert client.get("/habits/same-id/log", headers=b).status_code == 404
    assert client.put("/habits/same-id/completions/2026-09-03", json={"count": 1}, headers=b).status_code == 404
    assert client.get("/settings", headers=b).json() == {}
    assert client.get("/sync", headers=b).json()["habits"] == []

    # B can use the same habit id independently; deleting it leaves A's alone.
    client.put("/habits/same-id", json=habit_json(title="B's habit"), headers=b)
    client.delete("/habits/same-id", headers=b)
    assert client.get("/habits/same-id", headers=a).json()["title"] == "A's habit"
    assert client.get("/habits/same-id/log", headers=a).json()["completions"] == {"2026-09-02": 1}
