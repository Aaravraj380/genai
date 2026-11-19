"""Habits and their daily logs (check-offs and streak freezes)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Response, status

from .. import services as svc
from ..deps import CurrentUser, DbDep
from ..models import Habit
from ..schemas import CompletionOut, CountIn, DateKey, HabitIn, HabitLog, HabitOut, LoggableDay

router = APIRouter(prefix="/habits", tags=["habits"])

HabitIdPath = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.:\-]{1,64}$")]
_EXCLUDE_NONE = {"response_model_exclude_none": True}


def _habit_or_404(db, user_id: int, habit_id: str) -> Habit:
    habit = svc.get_habit(db, user_id, habit_id)
    if habit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Habit not found")
    return habit


def _check_day(value: str, validator) -> str:
    """Validate a date taken from the URL with the same rules as JSON bodies."""
    from pydantic import TypeAdapter, ValidationError

    try:
        return TypeAdapter(validator).validate_python(value)
    except ValidationError as e:
        msg = e.errors()[0]["msg"].removeprefix("Value error, ")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"date {msg}") from None


@router.get("", response_model=list[HabitOut], **_EXCLUDE_NONE)
def list_habits(user: CurrentUser, db: DbDep):
    return svc.list_habits(db, user.id)


@router.get("/{habit_id}", response_model=HabitOut, **_EXCLUDE_NONE)
def get_habit(habit_id: HabitIdPath, user: CurrentUser, db: DbDep):
    try:
        return svc.read_habit(db, user.id, habit_id)
    except svc.NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Habit not found") from None


@router.put("/{habit_id}", response_model=HabitOut, **_EXCLUDE_NONE)
def put_habit(habit_id: HabitIdPath, body: HabitIn, user: CurrentUser, db: DbDep, response: Response):
    """Create or replace a habit. The app chooses the id, so retrying is always safe."""
    if body.id is not None and body.id != habit_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "id in the body does not match the URL")
    created = svc.upsert_habit(db, user.id, body, habit_id)
    db.commit()
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return svc.read_habit(db, user.id, habit_id)


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: HabitIdPath, user: CurrentUser, db: DbDep) -> Response:
    """Delete a habit with all its history. Deleting a habit that's already gone is not an error."""
    svc.delete_habit(db, user.id, habit_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{habit_id}/log", response_model=HabitLog)
def get_log(habit_id: HabitIdPath, user: CurrentUser, db: DbDep):
    _habit_or_404(db, user.id, habit_id)
    return svc.read_log(db, user.id, habit_id)


@router.put("/{habit_id}/completions/{day}", response_model=CompletionOut)
def put_completion(habit_id: HabitIdPath, day: str, body: CountIn, user: CurrentUser, db: DbDep):
    """Set how many times the habit was done on `day` (0 clears it). Counts above the target are capped."""
    day = _check_day(day, LoggableDay)
    habit = _habit_or_404(db, user.id, habit_id)
    count = svc.set_completion(db, habit, day, body.count)
    db.commit()
    return CompletionOut(
        habit_id=habit_id, date=day, count=count, target_per_day=habit.target_per_day, completed=count >= habit.target_per_day
    )


@router.delete("/{habit_id}/completions/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_completion(habit_id: HabitIdPath, day: str, user: CurrentUser, db: DbDep) -> Response:
    day = _check_day(day, DateKey)
    habit = _habit_or_404(db, user.id, habit_id)
    svc.set_completion(db, habit, day, 0)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{habit_id}/freezes/{day}", status_code=status.HTTP_204_NO_CONTENT)
def put_freeze(habit_id: HabitIdPath, day: str, user: CurrentUser, db: DbDep) -> Response:
    """Protect a day with a streak freeze. A day that is already complete can't be frozen."""
    day = _check_day(day, DateKey)
    habit = _habit_or_404(db, user.id, habit_id)
    if svc.is_day_complete(db, habit, day):
        raise HTTPException(status.HTTP_409_CONFLICT, "That day is already complete — no freeze needed")
    svc.set_freeze(db, habit, day, True)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{habit_id}/freezes/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_freeze(habit_id: HabitIdPath, day: str, user: CurrentUser, db: DbDep) -> Response:
    day = _check_day(day, DateKey)
    habit = _habit_or_404(db, user.id, habit_id)
    svc.set_freeze(db, habit, day, False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
