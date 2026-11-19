"""Database tables.

Every habit-related row is keyed by (user_id, …) so one user can never read or
overwrite another user's data, even if two devices happen to generate the same
habit id. Deleting a user or a habit cascades to everything beneath it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    #: Bumped on password change / "log out everywhere" — invalidates older tokens.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Habit(Base):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint("target_per_day BETWEEN 1 AND 20", name="ck_habit_target"),
        CheckConstraint("frequency_type IN ('daily','weekdays','weekends','custom')", name="ck_habit_freq"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(60))
    frequency_type: Mapped[str] = mapped_column(String(10))
    frequency_days: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "1,3,5"
    creation_date: Mapped[str] = mapped_column(String(10))  # local calendar day, YYYY-MM-DD
    created_at: Mapped[str] = mapped_column(String(40))  # ISO instant from the device
    icon: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(7))
    category: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_per_day: Mapped[int] = mapped_column(Integer, default=1)
    reminder_enabled: Mapped[bool | None] = mapped_column(nullable=True)
    reminder_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_message: Mapped[str | None] = mapped_column(String(80), nullable=True)
    template_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


_HABIT_FK = lambda: ForeignKeyConstraint(  # noqa: E731
    ["user_id", "habit_id"], ["habits.user_id", "habits.id"], ondelete="CASCADE"
)


class Pause(Base):
    __tablename__ = "pauses"
    __table_args__ = (_HABIT_FK(),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    start_date: Mapped[str] = mapped_column(String(10), primary_key=True)
    end_date: Mapped[str | None] = mapped_column(String(10), nullable=True)


class Completion(Base):
    __tablename__ = "completions"
    __table_args__ = (_HABIT_FK(), CheckConstraint("count BETWEEN 1 AND 20", name="ck_completion_count"))

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    date: Mapped[str] = mapped_column(String(10), primary_key=True, index=True)
    count: Mapped[int] = mapped_column(Integer)


class Freeze(Base):
    __tablename__ = "freezes"
    __table_args__ = (_HABIT_FK(),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    date: Mapped[str] = mapped_column(String(10), primary_key=True)


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    #: JSON object of preferences (theme, language, weekStartsOn, …).
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
