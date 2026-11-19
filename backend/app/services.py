"""Business logic shared by the routers: converting rows, sync ops, merging."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import models as m
from .schemas import (
    DeleteHabitOp,
    HabitIn,
    HabitLog,
    HabitOut,
    Pause,
    Reminder,
    SetCompletionOp,
    SetFreezeOp,
    SetSettingsOp,
    SettingsData,
    SkippedOp,
    Snapshot,
    UpsertHabitOp,
)


class NotFound(Exception):
    pass


# --------------------------------------------------------------------------- #
# Habits                                                                       #
# --------------------------------------------------------------------------- #


def get_habit(db: Session, user_id: int, habit_id: str) -> m.Habit | None:
    return db.get(m.Habit, (user_id, habit_id))


def habit_to_out(h: m.Habit, pauses: list[m.Pause]) -> HabitOut:
    days = [int(d) for d in h.frequency_days.split(",")] if h.frequency_days else None
    reminder = None
    if h.reminder_hour is not None and h.reminder_minute is not None:
        reminder = Reminder(
            enabled=bool(h.reminder_enabled),
            hour=h.reminder_hour,
            minute=h.reminder_minute,
            message=h.reminder_message,
        )
    return HabitOut(
        id=h.id,
        title=h.title,
        frequency={"type": h.frequency_type, "days": days},
        creation_date=h.creation_date,
        created_at=h.created_at,
        icon=h.icon,
        color=h.color,
        category=h.category,
        note=h.note,
        target_per_day=h.target_per_day,
        reminder=reminder,
        pauses=[Pause(start=p.start_date, end=p.end_date) for p in sorted(pauses, key=lambda p: p.start_date)],
        template_key=h.template_key,
        sort_order=h.sort_order,
    )


def _pauses_by_habit(db: Session, user_id: int) -> dict[str, list[m.Pause]]:
    out: dict[str, list[m.Pause]] = {}
    for p in db.scalars(select(m.Pause).where(m.Pause.user_id == user_id)):
        out.setdefault(p.habit_id, []).append(p)
    return out


def list_habits(db: Session, user_id: int) -> list[HabitOut]:
    pauses = _pauses_by_habit(db, user_id)
    rows = db.scalars(select(m.Habit).where(m.Habit.user_id == user_id).order_by(m.Habit.sort_order, m.Habit.created_at))
    return [habit_to_out(h, pauses.get(h.id, [])) for h in rows]


def read_habit(db: Session, user_id: int, habit_id: str) -> HabitOut:
    h = get_habit(db, user_id, habit_id)
    if h is None:
        raise NotFound
    pauses = list(db.scalars(select(m.Pause).where(m.Pause.user_id == user_id, m.Pause.habit_id == habit_id)))
    return habit_to_out(h, pauses)


def upsert_habit(db: Session, user_id: int, data: HabitIn, habit_id: str) -> bool:
    """Create or fully replace a habit. Returns True if it was created."""
    h = get_habit(db, user_id, habit_id)
    created = h is None
    if created:
        if data.sort_order is None:
            top = db.scalar(select(func.max(m.Habit.sort_order)).where(m.Habit.user_id == user_id))
            data.sort_order = 0 if top is None else top + 1
        h = m.Habit(user_id=user_id, id=habit_id)
        db.add(h)
    h.title = data.title
    h.frequency_type = data.frequency.type
    h.frequency_days = ",".join(str(d) for d in data.frequency.days) if data.frequency.days else None
    h.creation_date = data.creation_date
    h.created_at = data.created_at
    h.icon = data.icon
    h.color = data.color
    h.category = data.category
    h.note = data.note
    h.target_per_day = data.target_per_day
    h.reminder_enabled = data.reminder.enabled if data.reminder else None
    h.reminder_hour = data.reminder.hour if data.reminder else None
    h.reminder_minute = data.reminder.minute if data.reminder else None
    h.reminder_message = data.reminder.message if data.reminder else None
    h.template_key = data.template_key
    if data.sort_order is not None:
        h.sort_order = data.sort_order
    db.flush()  # the habit row must exist before its pauses (foreign key)

    db.execute(delete(m.Pause).where(m.Pause.user_id == user_id, m.Pause.habit_id == habit_id))
    seen: set[str] = set()
    for p in data.pauses:
        if p.start not in seen:  # (habit, start) is the primary key
            seen.add(p.start)
            db.add(m.Pause(user_id=user_id, habit_id=habit_id, start_date=p.start, end_date=p.end))
    if not created:
        # Lowering the daily target caps existing counts, exactly like the app does.
        for c in db.scalars(
            select(m.Completion).where(
                m.Completion.user_id == user_id,
                m.Completion.habit_id == habit_id,
                m.Completion.count > data.target_per_day,
            )
        ):
            c.count = data.target_per_day
    db.flush()
    return created


def delete_habit(db: Session, user_id: int, habit_id: str) -> bool:
    res = db.execute(delete(m.Habit).where(m.Habit.user_id == user_id, m.Habit.id == habit_id))
    return res.rowcount > 0


# --------------------------------------------------------------------------- #
# Logs                                                                         #
# --------------------------------------------------------------------------- #


def read_log(db: Session, user_id: int, habit_id: str) -> HabitLog:
    comps = db.scalars(select(m.Completion).where(m.Completion.user_id == user_id, m.Completion.habit_id == habit_id))
    frz = db.scalars(select(m.Freeze).where(m.Freeze.user_id == user_id, m.Freeze.habit_id == habit_id))
    return HabitLog.model_construct(
        completions={c.date: c.count for c in comps},
        frozen={f.date: True for f in frz},
    )


def read_all_logs(db: Session, user_id: int, habit_ids: list[str]) -> dict[str, HabitLog]:
    logs = {hid: HabitLog.model_construct(completions={}, frozen={}) for hid in habit_ids}
    for c in db.scalars(select(m.Completion).where(m.Completion.user_id == user_id)):
        if c.habit_id in logs:
            logs[c.habit_id].completions[c.date] = c.count
    for f in db.scalars(select(m.Freeze).where(m.Freeze.user_id == user_id)):
        if f.habit_id in logs:
            logs[f.habit_id].frozen[f.date] = True
    return logs


def set_completion(db: Session, habit: m.Habit, day: str, count: int) -> int:
    """Store a day's count (0 removes it). Counts above the target are capped. Returns the stored count."""
    count = min(count, habit.target_per_day)
    row = db.get(m.Completion, (habit.user_id, habit.id, day))
    if count == 0:
        if row is not None:
            db.delete(row)
    else:
        if row is None:
            db.add(m.Completion(user_id=habit.user_id, habit_id=habit.id, date=day, count=count))
        else:
            row.count = count
        if count >= habit.target_per_day:
            # A completed day no longer needs a freeze (same rule as the app).
            freeze = db.get(m.Freeze, (habit.user_id, habit.id, day))
            if freeze is not None:
                db.delete(freeze)
    db.flush()
    return count


def is_day_complete(db: Session, habit: m.Habit, day: str) -> bool:
    row = db.get(m.Completion, (habit.user_id, habit.id, day))
    return row is not None and row.count >= habit.target_per_day


def set_freeze(db: Session, habit: m.Habit, day: str, frozen: bool) -> None:
    row = db.get(m.Freeze, (habit.user_id, habit.id, day))
    if frozen and row is None:
        db.add(m.Freeze(user_id=habit.user_id, habit_id=habit.id, date=day))
    elif not frozen and row is not None:
        db.delete(row)
    db.flush()


# --------------------------------------------------------------------------- #
# Settings                                                                     #
# --------------------------------------------------------------------------- #


def read_settings(db: Session, user_id: int) -> SettingsData:
    row = db.get(m.UserSettings, user_id)
    raw = json.loads(row.data) if row else {}
    try:
        return SettingsData.model_validate(raw)
    except Exception:  # corrupted row → defaults rather than a broken account
        return SettingsData()


def patch_settings(db: Session, user_id: int, patch: SettingsData) -> SettingsData:
    current = read_settings(db, user_id).model_dump(by_alias=True, exclude_none=True)
    current.update(patch.model_dump(by_alias=True, exclude_none=True))
    row = db.get(m.UserSettings, user_id)
    if row is None:
        row = m.UserSettings(user_id=user_id)
        db.add(row)
    row.data = json.dumps(current, ensure_ascii=False)
    db.flush()
    return SettingsData.model_validate(current)


# --------------------------------------------------------------------------- #
# Snapshot / sync                                                              #
# --------------------------------------------------------------------------- #


def snapshot(db: Session, user_id: int) -> dict:
    habits = list_habits(db, user_id)
    return {
        "habits": habits,
        "logs": read_all_logs(db, user_id, [h.id for h in habits]),
        "settings": read_settings(db, user_id),
        "server_time": datetime.now(UTC),
    }


def _write_log(db: Session, habit: m.Habit, log: HabitLog) -> None:
    for day, count in log.completions.items():
        set_completion(db, habit, day, count)
    for day in log.frozen:
        if not is_day_complete(db, habit, day):
            set_freeze(db, habit, day, True)


def replace_all(db: Session, user_id: int, data: Snapshot) -> None:
    """Make the account exactly equal to `data` (used for 'upload this device')."""
    db.execute(delete(m.Habit).where(m.Habit.user_id == user_id))  # cascades to logs/pauses
    db.flush()
    for i, h in enumerate(data.habits):
        if h.sort_order is None:
            h.sort_order = i
        upsert_habit(db, user_id, h, h.id)  # type: ignore[arg-type]
        _write_log(db, get_habit(db, user_id, h.id), data.logs.get(h.id) or HabitLog())  # type: ignore[arg-type]
    if data.settings is not None:
        db.execute(delete(m.UserSettings).where(m.UserSettings.user_id == user_id))
        patch_settings(db, user_id, data.settings)


def merge_into(db: Session, user_id: int, data: Snapshot) -> None:
    """Combine a device's data with the account without losing anything.

    Mirrors the app's `mergeSnapshots`: habits are unioned by id (the device's
    version of a habit wins), and for each day the higher count wins; freezes
    are unioned unless the day is complete.
    """
    for h in data.habits:
        existing = get_habit(db, user_id, h.id)  # type: ignore[arg-type]
        if h.sort_order is None:
            h.sort_order = existing.sort_order if existing else None
        upsert_habit(db, user_id, h, h.id)  # type: ignore[arg-type]
        habit = get_habit(db, user_id, h.id)  # type: ignore[arg-type]
        assert habit is not None
        incoming = data.logs.get(h.id) or HabitLog()
        current = read_log(db, user_id, h.id)  # type: ignore[arg-type]
        for day, count in incoming.completions.items():
            if count > current.completions.get(day, 0):
                set_completion(db, habit, day, count)
        for day in incoming.frozen:
            if not is_day_complete(db, habit, day):
                set_freeze(db, habit, day, True)
    if data.settings is not None:
        patch_settings(db, user_id, data.settings)


def apply_ops(db: Session, user_id: int, ops: list) -> tuple[int, list[SkippedOp]]:
    """Apply a device's queued changes in order. Changes that no longer make
    sense (e.g. a check-off for a habit another device deleted) are skipped,
    not failed, so one stale change can't block the rest of the queue."""
    applied = 0
    skipped: list[SkippedOp] = []
    for i, op in enumerate(ops):
        if isinstance(op, UpsertHabitOp):
            upsert_habit(db, user_id, op.habit, op.habit.id)  # type: ignore[arg-type]
        elif isinstance(op, DeleteHabitOp):
            delete_habit(db, user_id, op.habit_id)  # deleting twice is fine
        elif isinstance(op, SetCompletionOp | SetFreezeOp):
            habit = get_habit(db, user_id, op.habit_id)
            if habit is None:
                skipped.append(SkippedOp(index=i, reason="habit not found"))
                continue
            if isinstance(op, SetCompletionOp):
                set_completion(db, habit, op.date, op.count)
            else:
                if op.frozen and is_day_complete(db, habit, op.date):
                    skipped.append(SkippedOp(index=i, reason="day already complete"))
                    continue
                set_freeze(db, habit, op.date, op.frozen)
        elif isinstance(op, SetSettingsOp):
            patch_settings(db, user_id, op.settings)
        applied += 1
    db.flush()
    return applied, skipped
