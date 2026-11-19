# Focus & Flow — Habit Tracker

```
streak-habit/
├─ frontend/   Expo / React Native app (Android, iOS, web) — works fully offline on its own
└─ backend/    Python FastAPI server — optional accounts + phone ↔ web sync (SQLite on your PC)
```

## Run everything (Windows, VS Code)

Open the `streak-habit` folder in VS Code and use two terminals (**Terminal → New Terminal**, then the **+** button).

**Terminal 1: backend** (first time: `python --version` must be 3.11 or newer)

```powershell
cd backend
python -m venv .venv                  # first time only
.venv\Scripts\activate
pip install -r requirements-dev.txt   # first time only
python run.py
```

Leave it running. It prints `Phone (Wi-Fi) : http://<your-PC-IP>:8000`. (Or double-click `backend\start.bat`.)

**Terminal 2: frontend**

```powershell
cd frontend
npm install        # first time after moving the folder (fast, mostly cached)
npx expo start     # scan the QR code with Expo Go; press w for the website
```

Then in the app: **Settings → Account & sync → Log in or sign up**. Log in to the same account on the
phone and on the website and they stay in sync.

### Phone checklist (same Wi-Fi)

1. Phone and PC on the **same Wi-Fi**, and that Wi-Fi set to **Private** on Windows.
2. When Windows asks, **allow Python and Node.js on Private networks** (or allow ports 8000 and 8081 in Windows Defender Firewall).
3. On the phone's browser, `http://<PC-IP>:8000/health` should show `"status":"ok"`.
4. The app finds the server automatically from the QR code. If not, type `http://<PC-IP>:8000` in
   **Account → Server** and tap **Test connection**.
5. Don't use `--tunnel` for this: a tunnel only forwards the app, not port 8000.

## Tests

```powershell
cd backend;  .venv\Scripts\activate;  pytest            # 128 API tests
cd frontend; npm test                                   # 112 app tests, incl. sync against the real backend
cd frontend; npm run typecheck; npm run lint
```

More detail: `frontend/README.md` (app, data model, sync) and `backend/README.md` (API reference, config).
