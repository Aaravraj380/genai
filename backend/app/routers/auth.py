"""Sign up, log in, profile, password and account deletion."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..deps import CurrentUser, DbDep, SettingsDep
from ..models import User
from ..schemas import AuthOut, ChangePasswordIn, DeleteAccountIn, LoginIn, ProfilePatch, SignupIn, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User, settings) -> AuthOut:
    token, expires_in = create_access_token(user.id, user.token_version, settings.secret_key, settings.access_token_days)
    return AuthOut(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user, from_attributes=True))


@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: DbDep, settings: SettingsDep) -> AuthOut:
    """Create an account and log straight in."""
    if db.scalar(select(User.id).where(User.email == body.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two sign-ups with the same email at the same moment
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from None
    db.refresh(user)
    return _auth_response(user, settings)


def _login(email: str, password: str, request: Request, db, settings) -> AuthOut:
    limiter = request.app.state.login_limiter
    key = f"{email}|{request.client.host if request.client else '-'}"
    wait = limiter.retry_after(key)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many wrong attempts. Try again in {wait} seconds.",
            headers={"Retry-After": str(wait)},
        )
    user = db.scalar(select(User).where(User.email == email))
    if not verify_password(password, user.password_hash if user else None):
        limiter.fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    limiter.reset(key)
    return _auth_response(user, settings)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, request: Request, db: DbDep, settings: SettingsDep) -> AuthOut:
    return _login(body.email, body.password, request, db, settings)


@router.post("/token", response_model=AuthOut, summary="Login (form) — used by the Authorize button in /docs")
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, db: DbDep, settings: SettingsDep) -> AuthOut:
    return _login(form.username.strip().lower(), form.password, request, db, settings)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfilePatch, user: CurrentUser, db: DbDep) -> User:
    user.name = body.name
    db.commit()
    return user


@router.post("/change-password", response_model=AuthOut)
def change_password(body: ChangePasswordIn, user: CurrentUser, db: DbDep, settings: SettingsDep) -> AuthOut:
    """Changes the password and logs out every other device (their tokens stop working)."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    return _auth_response(user, settings)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(user: CurrentUser, db: DbDep) -> Response:
    """Invalidate every token issued so far, on every device (including this one)."""
    user.token_version += 1
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: DeleteAccountIn, user: CurrentUser, db: DbDep) -> Response:
    """Permanently delete the account and all its habits, history and settings."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Password is wrong")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
