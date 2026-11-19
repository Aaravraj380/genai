"""Request / response models.

JSON uses camelCase so it matches the app's TypeScript types exactly
(`creationDate`, `targetPerDay`, …). Validation mirrors the app's own rules,
so anything the app can create the server accepts, and nothing malformed can
reach the database.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

# --------------------------------------------------------------------------- #
# Shared field types                                                           #
# --------------------------------------------------------------------------- #

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_CATEGORY_LENGTH = 20
MAX_CUSTOM_CATEGORIES = 100
MAX_HABITS = 500


def _check_date_key(v: str) -> str:
    """A real calendar day written YYYY-MM-DD (e.g. 2026-02-30 is rejected)."""
    if not isinstance(v, str) or not _DATE_RE.match(v):
        raise ValueError("must be a date in YYYY-MM-DD format")
    try:
        d = date.fromisoformat(v)
    except ValueError as e:
        raise ValueError("is not a real calendar date") from e
    if not 2000 <= d.year <= 2100:
        raise ValueError("year must be between 2000 and 2100")
    return v


def latest_allowed_day() -> str:
    """The furthest-ahead 'today' anywhere on Earth (UTC+14) is at most tomorrow in UTC."""
    return (datetime.now(UTC).date() + timedelta(days=1)).isoformat()


def _not_in_future(v: str) -> str:
    if v > latest_allowed_day():
        raise ValueError("cannot log a day in the future")
    return v


DateKey = Annotated[str, AfterValidator(_check_date_key)]
LoggableDay = Annotated[str, AfterValidator(_check_date_key), AfterValidator(_not_in_future)]
HabitId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_.:\-]{1,64}$")]
HabitIcon = Literal["reading", "workout", "hydrate", "mind", "focus", "run", "sleep", "nutrition", "journal", "code"]
Count = Annotated[int, Field(ge=0, le=20, strict=True)]  # strict: "1" or 1.5 are rejected, not coerced


def clean_category(name: str) -> str:
    """Same as the app: trim, drop leading '#', collapse spaces."""
    return re.sub(r"\s+", " ", name.strip().lstrip("#")).strip()


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


# --------------------------------------------------------------------------- #
# Auth                                                                         #
# --------------------------------------------------------------------------- #

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class SignupIn(CamelModel):
    email: EmailStr
    password: Password
    name: Name

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def _strong_enough(cls, v: str) -> str:
        if v.strip() == "" or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("password must contain at least one letter and one number")
        return v


class LoginIn(CamelModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class UserOut(CamelModel):
    id: int
    email: str
    name: str
    created_at: datetime


class AuthOut(CamelModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class ProfilePatch(CamelModel):
    name: Name


class ChangePasswordIn(CamelModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password

    @field_validator("new_password")
    @classmethod
    def _strong_enough(cls, v: str) -> str:
        return SignupIn._strong_enough(v)


class DeleteAccountIn(CamelModel):
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


# --------------------------------------------------------------------------- #
# Habits                                                                       #
# --------------------------------------------------------------------------- #


class Frequency(CamelModel):
    type: Literal["daily", "weekdays", "weekends", "custom"]
    days: list[Annotated[int, Field(ge=0, le=6, strict=True)]] | None = None

    @model_validator(mode="after")
    def _days_for_custom(self) -> Frequency:
        if self.type == "custom":
            if not self.days:
                raise ValueError("custom frequency needs at least one weekday (0=Sun … 6=Sat)")
            self.days = list(dict.fromkeys(self.days))  # de-duplicate, keep order
        else:
            self.days = None
        return self


class Reminder(CamelModel):
    enabled: bool
    hour: Annotated[int, Field(ge=0, le=23, strict=True)]
    minute: Annotated[int, Field(ge=0, le=59, strict=True)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None

    @field_validator("message")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        return v or None


class Pause(CamelModel):
    start: DateKey
    end: DateKey | None = None  # exclusive: the day the habit resumed

    @model_validator(mode="after")
    def _ordered(self) -> Pause:
        if self.end is not None and self.end <= self.start:
            raise ValueError("pause end must be after its start")
        return self


class HabitIn(CamelModel):
    """A habit exactly as the app stores it. `id` may be omitted when it is in the URL."""

    id: HabitId | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    frequency: Frequency
    creation_date: DateKey
    created_at: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    icon: HabitIcon
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
    category: str
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    target_per_day: Annotated[int, Field(ge=1, le=20, strict=True)] = 1
    reminder: Reminder | None = None
    pauses: Annotated[list[Pause], Field(max_length=200)] = []
    template_key: Annotated[str, StringConstraints(max_length=40)] | None = None
    sort_order: Annotated[int, Field(ge=0, le=100_000)] | None = None

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        v = clean_category(v)
        if not v:
            raise ValueError("category is required")
        if len(v) > MAX_CATEGORY_LENGTH:
            raise ValueError(f"category must be at most {MAX_CATEGORY_LENGTH} characters")
        return v

    @field_validator("note")
    @classmethod
    def _blank_note(cls, v: str | None) -> str | None:
        return v or None


class HabitOut(CamelModel):
    id: str
    title: str
    frequency: Frequency
    creation_date: str
    created_at: str
    icon: str
    color: str
    category: str
    note: str | None = None
    target_per_day: int
    reminder: Reminder | None = None
    pauses: list[Pause]
    template_key: str | None = None
    sort_order: int


class HabitLog(CamelModel):
    """Same shape as the app's HabitLog: {completions: {day: count}, frozen: {day: true}}."""

    completions: dict[DateKey, Annotated[int, Field(ge=1, le=20, strict=True)]] = {}
    frozen: dict[DateKey, Literal[True]] = {}

    @model_validator(mode="after")
    def _bounded(self) -> HabitLog:
        if len(self.completions) > 40_000 or len(self.frozen) > 40_000:
            raise ValueError("log is too large")
        return self


class CountIn(CamelModel):
    count: Count


class CompletionOut(CamelModel):
    habit_id: str
    date: str
    count: int
    target_per_day: int
    completed: bool


# --------------------------------------------------------------------------- #
# Settings                                                                     #
# --------------------------------------------------------------------------- #


class SettingsData(CamelModel):
    """Preferences that follow the user across devices. All optional: send only what changed.

    (The profile photo is a file on one device, so it is deliberately not synced.)
    """

    theme: Literal["system", "dark", "light"] | None = None
    language: Literal["en", "hi", "bn"] | None = None
    week_starts_on: Literal[0, 1] | None = None
    freezes_per_month: Annotated[int, Field(ge=0, le=5)] | None = None
    custom_categories: list[str] | None = None
    profile_name: Annotated[str, StringConstraints(max_length=40)] | None = None

    @field_validator("custom_categories")
    @classmethod
    def _categories(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out: list[str] = []
        seen: set[str] = set()
        for raw in v:
            c = clean_category(str(raw))[:MAX_CATEGORY_LENGTH]
            if c and c.lower() not in seen:
                seen.add(c.lower())
                out.append(c)
        if len(out) > MAX_CUSTOM_CATEGORIES:
            raise ValueError(f"at most {MAX_CUSTOM_CATEGORIES} custom categories")
        return out


# --------------------------------------------------------------------------- #
# Sync                                                                         #
# --------------------------------------------------------------------------- #


class Snapshot(CamelModel):
    habits: Annotated[list[HabitIn], Field(max_length=MAX_HABITS)]
    logs: dict[str, HabitLog] = {}
    settings: SettingsData | None = None

    @model_validator(mode="after")
    def _ids(self) -> Snapshot:
        ids = [h.id for h in self.habits]
        if any(i is None for i in ids):
            raise ValueError("every habit needs an id")
        if len(set(ids)) != len(ids):
            raise ValueError("habit ids must be unique")
        return self


class SnapshotOut(CamelModel):
    habits: list[HabitOut]
    logs: dict[str, HabitLog]
    settings: SettingsData
    server_time: datetime


class UpsertHabitOp(CamelModel):
    type: Literal["upsertHabit"]
    habit: HabitIn

    @model_validator(mode="after")
    def _has_id(self) -> UpsertHabitOp:
        if not self.habit.id:
            raise ValueError("habit.id is required")
        return self


class DeleteHabitOp(CamelModel):
    type: Literal["deleteHabit"]
    habit_id: HabitId


class SetCompletionOp(CamelModel):
    type: Literal["setCompletion"]
    habit_id: HabitId
    date: LoggableDay
    count: Count


class SetFreezeOp(CamelModel):
    type: Literal["setFreeze"]
    habit_id: HabitId
    date: DateKey
    frozen: bool


class SetSettingsOp(CamelModel):
    type: Literal["setSettings"]
    settings: SettingsData


SyncOp = Annotated[
    UpsertHabitOp | DeleteHabitOp | SetCompletionOp | SetFreezeOp | SetSettingsOp,
    Field(discriminator="type"),
]


class PushIn(CamelModel):
    ops: Annotated[list[SyncOp], Field(max_length=2000)]


class SkippedOp(CamelModel):
    index: int
    reason: str


class PushOut(CamelModel):
    applied: int
    skipped: list[SkippedOp]
    server_time: datetime
