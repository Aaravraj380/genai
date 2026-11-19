"""Settings and whole-account sync used by the app."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

from .. import services as svc
from ..deps import CurrentUser, DbDep
from ..schemas import PushIn, PushOut, SettingsData, Snapshot, SnapshotOut

settings_router = APIRouter(prefix="/settings", tags=["settings"])
router = APIRouter(prefix="/sync", tags=["sync"])


@settings_router.get("", response_model=SettingsData, response_model_exclude_none=True)
def get_settings(user: CurrentUser, db: DbDep):
    return svc.read_settings(db, user.id)


@settings_router.patch("", response_model=SettingsData, response_model_exclude_none=True)
def patch_settings(body: SettingsData, user: CurrentUser, db: DbDep):
    """Update only the preferences you send; the rest stay as they are."""
    out = svc.patch_settings(db, user.id, body)
    db.commit()
    return out


@router.get("", response_model=SnapshotOut, response_model_exclude_none=True)
def pull(user: CurrentUser, db: DbDep):
    """Everything in the account: habits, logs and settings."""
    return svc.snapshot(db, user.id)


@router.post("/push", response_model=PushOut)
def push(body: PushIn, user: CurrentUser, db: DbDep):
    """Apply a batch of changes queued on a device, in order, all-or-nothing.

    Every change sets a value (rather than adding to it), so sending the same
    batch twice — e.g. after a dropped connection — gives the same result.
    """
    applied, skipped = svc.apply_ops(db, user.id, body.ops)
    db.commit()
    return PushOut(applied=applied, skipped=skipped, server_time=datetime.now(UTC))


@router.post("/merge", response_model=SnapshotOut, response_model_exclude_none=True)
def merge(body: Snapshot, user: CurrentUser, db: DbDep):
    """Combine this device's data with the account (nothing is lost) and return the result.

    The app calls this right after logging in.
    """
    svc.merge_into(db, user.id, body)
    db.commit()
    return svc.snapshot(db, user.id)


@router.put("", response_model=SnapshotOut, response_model_exclude_none=True)
def replace(body: Snapshot, user: CurrentUser, db: DbDep):
    """Make the account exactly match the data sent (overwrites the account)."""
    svc.replace_all(db, user.id, body)
    db.commit()
    return svc.snapshot(db, user.id)
