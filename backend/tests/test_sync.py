"""Whole-account sync: pull, push (offline queue), merge on login, replace."""

from __future__ import annotations

import pytest

from .conftest import habit_json


def h(hid: str, **over) -> dict:
    return {**habit_json(**over), "id": hid}


def pull(client, headers) -> dict:
    body = client.get("/sync", headers=headers).json()
    body.pop("serverTime")
    return body


def test_pull_on_a_new_account(client, auth):
    r = client.get("/sync", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["habits"] == [] and body["logs"] == {} and body["settings"] == {}
    assert body["serverTime"]


OPS = [
    {"type": "upsertHabit", "habit": h("a", title="Read", targetPerDay=2, sortOrder=0)},
    {"type": "upsertHabit", "habit": h("b", title="Run", sortOrder=1)},
    {"type": "setCompletion", "habitId": "a", "date": "2026-09-02", "count": 1},
    {"type": "setCompletion", "habitId": "a", "date": "2026-09-02", "count": 2},
    {"type": "setCompletion", "habitId": "b", "date": "2026-09-02", "count": 1},
    {"type": "setFreeze", "habitId": "b", "date": "2026-09-03", "frozen": True},
    {"type": "setSettings", "settings": {"language": "hi", "customCategories": ["Family"]}},
    {"type": "setCompletion", "habitId": "b", "date": "2026-09-02", "count": 0},
]


def test_push_applies_queued_changes_in_order(client, auth):
    r = client.post("/sync/push", json={"ops": OPS}, headers=auth)
    assert r.status_code == 200
    assert r.json()["applied"] == len(OPS) and r.json()["skipped"] == []
    snap = pull(client, auth)
    assert [x["id"] for x in snap["habits"]] == ["a", "b"]
    assert snap["logs"] == {
        "a": {"completions": {"2026-09-02": 2}, "frozen": {}},
        "b": {"completions": {}, "frozen": {"2026-09-03": True}},
    }
    assert snap["settings"] == {"language": "hi", "customCategories": ["Family"]}


def test_resending_the_same_batch_is_harmless(client, auth):
    """A dropped connection means the app retries the whole batch."""
    client.post("/sync/push", json={"ops": OPS}, headers=auth)
    first = pull(client, auth)
    client.post("/sync/push", json={"ops": OPS}, headers=auth)
    assert pull(client, auth) == first


def test_stale_changes_are_skipped_not_fatal(client, auth):
    client.post("/sync/push", json={"ops": OPS[:2]}, headers=auth)
    ops = [
        {"type": "deleteHabit", "habitId": "b"},
        {"type": "setCompletion", "habitId": "b", "date": "2026-09-04", "count": 1},  # b is gone
        {"type": "deleteHabit", "habitId": "never-existed"},
        {"type": "setCompletion", "habitId": "a", "date": "2026-09-04", "count": 2},
        {"type": "setFreeze", "habitId": "a", "date": "2026-09-04", "frozen": True},  # already complete
    ]
    r = client.post("/sync/push", json={"ops": ops}, headers=auth).json()
    assert r["applied"] == 3
    assert r["skipped"] == [{"index": 1, "reason": "habit not found"}, {"index": 4, "reason": "day already complete"}]
    snap = pull(client, auth)
    assert [x["id"] for x in snap["habits"]] == ["a"]
    assert snap["logs"]["a"] == {"completions": {"2026-09-04": 2}, "frozen": {}}


@pytest.mark.parametrize(
    "bad_op",
    [
        {"type": "explode"},
        {"type": "setCompletion", "habitId": "a", "date": "2026-02-30", "count": 1},
        {"type": "setCompletion", "habitId": "a", "date": "2999-01-01", "count": 1},
        {"type": "setCompletion", "habitId": "a", "date": "2026-09-02", "count": 50},
        {"type": "upsertHabit", "habit": habit_json()},  # no id
        {"type": "upsertHabit", "habit": h("x", color="red")},
        {"type": "setSettings", "settings": {"theme": "neon"}},
        {"type": "setFreeze", "habitId": "a", "date": "2026-09-02"},
    ],
)
def test_one_invalid_change_rejects_the_whole_batch(client, auth, bad_op):
    ops = [{"type": "upsertHabit", "habit": h("a")}, bad_op]
    assert client.post("/sync/push", json={"ops": ops}, headers=auth).status_code == 422
    assert pull(client, auth)["habits"] == []  # nothing from the batch was applied


def test_batch_size_limit(client, auth):
    ops = [{"type": "deleteHabit", "habitId": "x"}] * 2001
    assert client.post("/sync/push", json={"ops": ops}, headers=auth).status_code == 422
    assert client.post("/sync/push", json={"ops": ops[:2000]}, headers=auth).status_code == 200
    assert client.post("/sync/push", json={"ops": []}, headers=auth).json()["applied"] == 0


def test_merge_on_login_loses_nothing(client, auth):
    # Already in the account (from another device):
    client.post(
        "/sync/push",
        json={"ops": [
            {"type": "upsertHabit", "habit": h("shared", title="Old title", targetPerDay=3)},
            {"type": "upsertHabit", "habit": h("server-only", title="Server")},
            {"type": "setCompletion", "habitId": "shared", "date": "2026-09-01", "count": 3},
            {"type": "setCompletion", "habitId": "shared", "date": "2026-09-02", "count": 1},
            {"type": "setFreeze", "habitId": "shared", "date": "2026-09-05", "frozen": True},
            {"type": "setSettings", "settings": {"theme": "light", "language": "bn"}},
        ]},
        headers=auth,
    )
    device = {
        "habits": [h("shared", title="New title", targetPerDay=3), h("device-only", title="Device")],
        "logs": {
            "shared": {"completions": {"2026-09-01": 1, "2026-09-02": 2, "2026-09-05": 3}, "frozen": {"2026-09-03": True}},
            "device-only": {"completions": {"2026-09-02": 1}, "frozen": {}},
        },
        "settings": {"language": "hi"},
    }
    r = client.post("/sync/merge", json=device, headers=auth)
    assert r.status_code == 200
    merged = r.json()
    titles = {x["id"]: x["title"] for x in merged["habits"]}
    assert titles == {"shared": "New title", "server-only": "Server", "device-only": "Device"}  # device's edit wins
    assert merged["logs"]["shared"] == {
        "completions": {"2026-09-01": 3, "2026-09-02": 2, "2026-09-05": 3},  # higher count wins per day
        "frozen": {"2026-09-03": True},  # 09-05 is now complete, so its freeze is dropped
    }
    assert merged["logs"]["device-only"]["completions"] == {"2026-09-02": 1}
    assert merged["settings"] == {"theme": "light", "language": "hi"}
    # Merging the same device data again changes nothing.
    again = client.post("/sync/merge", json=device, headers=auth).json()
    merged.pop("serverTime"), again.pop("serverTime")
    assert again == merged


def test_merge_into_an_empty_account_uploads_the_device(client, auth):
    device = {"habits": [h("a", sortOrder=0), h("b", sortOrder=1)], "logs": {"a": {"completions": {"2026-09-02": 1}}}}
    merged = client.post("/sync/merge", json=device, headers=auth).json()
    assert [x["id"] for x in merged["habits"]] == ["a", "b"]
    assert merged["logs"]["b"] == {"completions": {}, "frozen": {}}


def test_replace_makes_the_account_match_exactly(client, auth):
    client.post("/sync/push", json={"ops": OPS}, headers=auth)
    new = {
        "habits": [h("z", title="Only one", targetPerDay=2)],
        "logs": {"z": {"completions": {"2026-09-09": 2}, "frozen": {"2026-09-10": True}}, "ghost": {"completions": {"2026-09-09": 1}}},
        "settings": {"theme": "dark"},
    }
    r = client.put("/sync", json=new, headers=auth)
    assert r.status_code == 200
    snap = pull(client, auth)
    assert [x["id"] for x in snap["habits"]] == ["z"]
    assert snap["logs"] == {"z": {"completions": {"2026-09-09": 2}, "frozen": {"2026-09-10": True}}}  # logs for unknown habits dropped
    assert snap["settings"] == {"theme": "dark"}


def test_pulled_snapshot_can_be_pushed_back_unchanged(client, auth):
    client.post("/sync/push", json={"ops": OPS}, headers=auth)
    before = pull(client, auth)
    client.put("/sync", json=before, headers=auth)
    assert pull(client, auth) == before


@pytest.mark.parametrize(
    "bad",
    [
        {"habits": [h("a"), h("a")]},  # duplicate ids
        {"habits": [habit_json()]},  # missing id
        {"habits": [h("a")], "logs": {"a": {"completions": {"2026-09-02": 0}}}},
        {"habits": [h("a")], "logs": {"a": {"completions": {"bad-date": 1}}}},
        {"habits": [h("a")], "logs": {"a": {"frozen": {"2026-09-02": False}}}},
        {"logs": {}},
    ],
)
def test_snapshot_validation(client, auth, bad):
    assert client.put("/sync", json=bad, headers=auth).status_code == 422
    assert client.post("/sync/merge", json=bad, headers=auth).status_code == 422


def test_two_devices_stay_in_step(client, signup):
    """Phone and web are logged into the same account."""
    u = signup()
    phone = u["headers"]
    web_login = client.post("/auth/login", json={"email": u["email"], "password": u["password"]}).json()
    web = {"Authorization": f"Bearer {web_login['accessToken']}"}

    client.post("/sync/push", json={"ops": [{"type": "upsertHabit", "habit": h("a")}, {"type": "setCompletion", "habitId": "a", "date": "2026-09-02", "count": 1}]}, headers=phone)
    assert pull(client, web)["logs"]["a"]["completions"] == {"2026-09-02": 1}

    # The web deletes the habit while the phone is offline and still checks it off.
    client.post("/sync/push", json={"ops": [{"type": "deleteHabit", "habitId": "a"}]}, headers=web)
    late = client.post("/sync/push", json={"ops": [{"type": "setCompletion", "habitId": "a", "date": "2026-09-03", "count": 1}]}, headers=phone).json()
    assert late["skipped"] == [{"index": 0, "reason": "habit not found"}]
    assert pull(client, phone)["habits"] == pull(client, web)["habits"] == []
