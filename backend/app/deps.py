"""Shared FastAPI dependencies: database session and the logged-in user."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import Settings
from .models import User
from .security import decode_access_token

# tokenUrl powers the "Authorize" button in the interactive docs (/docs).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    yield from request.app.state.db.session()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbDep = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    db: DbDep,
    settings: SettingsDep,
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User:
    if not token:
        raise _unauthorized("Not logged in")
    decoded = decode_access_token(token, settings.secret_key)
    if decoded is None:
        raise _unauthorized("Session expired or invalid — please log in again")
    user_id, token_version = decoded
    user = db.get(User, user_id)
    if user is None or user.token_version != token_version:
        raise _unauthorized("Session expired or invalid — please log in again")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
