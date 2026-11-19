"""Password hashing (Argon2) and login tokens (signed JWT)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

_hasher = PasswordHash.recommended()  # Argon2id with safe defaults
# Used when the email doesn't exist, so a wrong email takes as long as a wrong password
# (stops attackers from discovering which emails have accounts by timing the response).
_DUMMY_HASH = _hasher.hash("not-a-real-password-0")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        _hasher.verify(password, _DUMMY_HASH)
        return False
    try:
        return _hasher.verify(password, password_hash)
    except Exception:  # malformed hash in the DB → treat as wrong password
        return False


def create_access_token(user_id: int, token_version: int, secret: str, days: int) -> tuple[str, int]:
    now = datetime.now(UTC)
    expires = now + timedelta(days=days)
    payload = {"sub": str(user_id), "tv": token_version, "iat": now, "exp": expires}
    return jwt.encode(payload, secret, algorithm=ALGORITHM), int((expires - now).total_seconds())


def decode_access_token(token: str, secret: str) -> tuple[int, int] | None:
    """Returns (user_id, token_version), or None if the token is invalid or expired."""
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp", "tv"]})
        return int(payload["sub"]), int(payload["tv"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


class LoginLimiter:
    """Blocks an email+IP after too many wrong passwords in a short window.

    Kept in memory: fine for one server process; it resets when the server restarts.
    """

    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._fails: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._fails[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def retry_after(self, key: str) -> int:
        """Seconds until another attempt is allowed (0 = allowed now)."""
        with self._lock:
            now = time.monotonic()
            q = self._prune(key, now)
            if len(q) < self.max_attempts:
                return 0
            return max(1, int(self.window - (now - q[0])) + 1)

    def fail(self, key: str) -> None:
        with self._lock:
            self._prune(key, time.monotonic()).append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)
