# Focus & Flow — Backend (Python · FastAPI)

Accounts and phone ↔ web sync for the Focus & Flow app. Everything is stored in one SQLite file on
your computer (`backend/data/focus_flow.db`), with no cloud service involved. The app works without this
server; it's only needed for logging in and syncing.

| | |
|---|---|
| Framework | FastAPI 0.165 · Uvicorn |
| Database | SQLite via SQLAlchemy 2 (foreign keys + cascades, WAL) |
| Auth | Email + password (Argon2id hashes via pwdlib), signed JWT bearer tokens (30 days) |
| Validation | Pydantic 2, same rules as the app (dates, colours, icons, targets 1–20 …) |
| Tests | pytest: 128 tests, 98% line coverage |

## Set up (once)

Needs **Python 3.11+** (`python --version`).

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```powershell
.venv\Scripts\activate
python run.py                     # = uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

It prints the addresses to use:

```
  This computer : http://localhost:8000
  Phone (Wi-Fi) : http://192.168.1.20:8000
  API docs      : http://localhost:8000/docs
```

Or just double-click **`start.bat`** (Windows): it creates the virtual environment the first time, installs
the requirements and starts the server.

**Phone can't connect?** The first time, Windows asks whether Python may use the network. Allow it on
**Private networks**. Your Wi-Fi must also be set to *Private* (Settings → Network & internet → Wi-Fi →
your network → Private). Check from the phone's browser: `http://<PC-IP>:8000/health` should show `"status":"ok"`.

## API

Interactive docs with "Try it out": **http://localhost:8000/docs** (click **Authorize** and log in with
an email and password to call the protected endpoints).

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Server + database check |
| POST | `/auth/signup` | Create account → `{accessToken, user}` (201) |
| POST | `/auth/login` | Log in → `{accessToken, user}`; 5 wrong tries per email+IP → 429 for 5 min |
| POST | `/auth/token` | Same, as a form (used by the docs' Authorize button) |
| GET / PATCH | `/auth/me` | Read / rename the account |
| POST | `/auth/change-password` | New password; logs out every other device |
| POST | `/auth/logout-all` | Invalidate every token |
| DELETE | `/auth/me` | Delete account + all data (password required) |
| GET | `/habits` | All habits, in order |
| GET / PUT / DELETE | `/habits/{id}` | Read / create-or-replace / delete (with history) |
| GET | `/habits/{id}/log` | `{completions: {day: count}, frozen: {day: true}}` |
| PUT / DELETE | `/habits/{id}/completions/{YYYY-MM-DD}` | Set a day's count (0 clears; capped at the target) |
| PUT / DELETE | `/habits/{id}/freezes/{YYYY-MM-DD}` | Freeze / unfreeze a day (409 if the day is complete) |
| GET / PATCH | `/settings` | Synced preferences (theme, language, week start, freezes, tags, name) |
| GET | `/sync` | Whole account: habits, logs, settings |
| POST | `/sync/push` | Apply the app's offline queue (≤ 2000 changes, in order, all-or-nothing) |
| POST | `/sync/merge` | Merge a device's data into the account (used at login) and return the result |
| PUT | `/sync` | Replace the whole account with the data sent |

JSON is camelCase, matching the app's TypeScript types. Every endpoint except `/health` and `/auth/*`
login/sign-up needs `Authorization: Bearer <token>`.

**Design choices worth knowing**

- **Calendar days, not timestamps.** A check-off belongs to the day on the user's clock (`YYYY-MM-DD`), so
  time zones and DST can't move it. Days up to *UTC + 1 day* are accepted (someone in UTC+14 is already "tomorrow").
- **Safe retries.** Every change *sets* a value (count = 2, frozen = true), so sending a batch twice after a
  dropped connection gives the same result. Habit ids are chosen by the app, so creating is an upsert.
- **Stale changes don't block the queue.** A check-off for a habit deleted on another device is reported in
  `skipped`, not failed.
- **Isolation.** Every row is keyed by `user_id`; one user can't read or overwrite another's data, even with
  the same habit id.

## Configuration (optional)

Copy `.env.example` to `.env`. Defaults work without it. `SECRET_KEY` is generated once into
`data/secret.key` so logins survive restarts. **Don't share or commit the `data/` folder**: it holds the
database and that key.

## Tests

```powershell
pytest                           # 128 tests
pytest --cov=app                 # with coverage
ruff check app tests             # lint
```

`tests/` covers sign-up/login validation, password hashing, brute-force lockout, expired / forged / revoked
tokens, password change, account deletion (with cascades), every habit field and validation rule, check-off
caps, freezes, settings, user isolation, push / merge / replace sync, idempotent retries, stale and invalid
changes, batch limits, CORS, restart persistence and foreign-key cascades.

The frontend also has an end-to-end suite (`frontend/src/sync/__tests__/engine.test.ts`) that starts this
server from `.venv` and drives the real sync engine against it.
