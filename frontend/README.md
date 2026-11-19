# Focus & Flow — Habit Tracker (Expo / React Native)

A production-ready, offline-first habit tracker for **iOS, Android (and web)** built from the Google Stitch
"Kinetic Obsidian" designs in `../Design`. Daily habit list, circular progress, streak highlights,
fluid check-off animations, a persistent bottom nav, a unit-tested streak engine, analytics charts,
streak freezes, reminders and a "welcome back" flow for users returning after days away.

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 · React 19 · Expo Router (file-based) |
| State | Zustand 5 + `persist` middleware |
| Storage | SQLite on the device via expo-sqlite (phone + web; offline-first, nothing leaves the device) |
| Animation | Reanimated 4 (UI-thread), expo-haptics |
| Charts | react-native-chart-kit 7 (v2 API) + custom SVG bars/sparklines (react-native-svg) |
| Reminders | expo-notifications (local, repeating) |
| Fonts / icons | Space Grotesk + Plus Jakarta Sans (@expo-google-fonts) · MaterialIcons |
| Backend (optional) | Python FastAPI server in `../backend` — accounts + phone ↔ web sync (`src/api`, `src/sync`) |

---

## 1. Run it

Requires Node 20+ and the **Expo Go** app on your phone (or an Android emulator / iOS simulator).

```bash
cd streak-habit/frontend
npm install          # installs the exact, SDK-compatible versions in package-lock.json
npx expo start       # scan the QR code with Expo Go (Android) or the Camera app (iOS)
# or:  npm run android  |  npm run ios  |  npm run web
```

First launch shows an empty state with three options: create a habit, add the 6-ritual starter pack
from the design, or **Explore with sample data** (60 days of demo history, removable via *Explore → Reset*).

### Quality gates

```bash
npm test             # 59 Jest tests: streak engine, dates/DST, freezes, stats, store, sync merge
npm run test:tz      # re-runs the domain suite under 6 time zones (UTC, Kolkata, New York, Kiritimati, Pago Pago, Lord Howe)
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # expo lint (includes React Compiler rules)
```

### Production builds

```bash
npx eas-cli@latest build --platform android   # or ios / all
```
Bundle id / package: `com.focusflow.streakhabit` (change in `app.json`). Reminders work in Expo Go;
only *push* notifications would need a development build (not used).

### How this was scaffolded (for reference)

```bash
npx create-expo-app@latest streak-habit --template default
npx expo install @react-native-async-storage/async-storage zustand react-native-svg \
  expo-haptics expo-notifications @expo/vector-icons
npm install react-native-chart-kit @expo-google-fonts/space-grotesk @expo-google-fonts/plus-jakarta-sans
npx expo install -- --save-dev jest-expo jest @types/jest
```

---

## 2. Folder structure

```
streak-habit/frontend/
├─ app.json                      Expo config (dark UI, splash, notifications plugin, bundle ids)
├─ scripts/test-timezones.js     Runs the test-suite under several TZs (cross-platform)
├─ assets/images/                App icons, splash, profile avatar from the Stitch folder
└─ src/
   ├─ app/                       ROUTES (Expo Router)
   │  ├─ _layout.tsx             Fonts, splash, providers, root stack, Welcome-back gate
   │  ├─ (tabs)/_layout.tsx      Tabs + custom persistent BottomNav
   │  ├─ (tabs)/index.tsx        Today dashboard
   │  ├─ (tabs)/analytics.tsx    Stats & charts
   │  ├─ (tabs)/explore.tsx      Habit list, template library, data controls
   │  ├─ habit/new.tsx           Create habit (modal)
   │  ├─ habit/[id]/index.tsx    Habit detail: streaks, calendar, freezes, pause
   │  ├─ habit/[id]/edit.tsx     Edit / delete (modal)
   │  ├─ settings.tsx            Personalisation + Account & sync card + data
   │  └─ account.tsx             Log in / sign up, server address, log out, delete account
   ├─ domain/                    PURE TypeScript business logic (no React) — fully unit-tested
   │  ├─ types.ts                Habit, TrackingLog, DayStatus, StreakRun …
   │  ├─ dates.ts                DateKey (YYYY-MM-DD) maths, DST-proof, midnight timer helper
   │  ├─ streaks.ts              Streak engine: current / longest / runs / totals / rates
   │  ├─ freezes.ts              Streak freezes + re-entry (inactivity) analysis
   │  ├─ stats.ts                Cross-habit analytics (periods, momentum, weekday rates, badges)
   │  ├─ templates.ts            Habit library + deterministic demo data
   │  ├─ format.ts               Frequency labels
   │  └─ __tests__/              Jest suites
   ├─ db/                        SQLite: schema & migrations, repository (all SQL), write-through sync, bootstrap
   ├─ api/                       FastAPI client: types, errors, server-address detection
   ├─ sync/                      Optional account sync: state diff → ops, offline queue, push/pull engine
   ├─ store/useHabitStore.ts     Zustand store (raw facts only), saved to SQLite by src/db
   ├─ hooks/useToday*.ts(x)      "Today" that rolls over at local midnight / on resume / on TZ change
   ├─ services/                  notifications, haptics, backups, merge rules
   ├─ theme/                     tokens.ts (design tokens) · ThemeProvider (theme + responsive layout) · icons
   └─ components/                primitives, animated (ring, check, rolling counters), chrome (header,
                                 bottom nav, glow), today, charts, MonthCalendar, HabitForm, dialogs
```

---

## 3. Design ingestion → theme

All tokens in `src/theme/tokens.ts` come straight from `Design/kinetic_obsidian/DESIGN.md` and the
Tailwind config embedded in each screen's `code.html`:

- **Colours** – obsidian surface stack `#0F1115 / #111317 / #181A20 / #222630`, ghost border `#2E3440`,
  Electric Emerald `#10B981` / `#4EDEA3` (completion only), Flame Orange `#F97316` (streaks only),
  Focus Cobalt `#ADC6FF` (meta / frozen days), text `#FFFFFF / #9CA3AF / #6B7280`.
- **Type** – Space Grotesk for headlines, labels and **tabular** numerals; Plus Jakarta Sans for body.
  Every scale step (display-hero … label-sm) with its em letter-spacing converted to points.
- **Shape & spacing** – 8 / 12 / 16 / 24 radii, pills, 4-8-16-24-40 spacing, 16 px gutters.
- **Depth** – no drop shadows; luminous `boxShadow` glows (emerald on completion, orange on streaks) and SVG
  gradient washes behind hero cards.

`ThemeProvider` delivers the theme via context; `useLayout()` supplies responsive breakpoints
(compact < 360, phone, tablet ≥ 768: wider gutters, centred max-width content, 1/2/4-column stat grids).
Verified at 320 px, 390 px and 820 px widths.

---

## 4. Data model & streak rules

```ts
Habit        { id, title, frequency, creationDate, createdAt, icon, color, category, note?,
               targetPerDay, reminder?, pauses[] }
Frequency    daily | weekdays | weekends | custom(days[])
TrackingLog  Record<DateKey, number>      // date → completions that day; complete = count ≥ targetPerDay
HabitLog     { completions: TrackingLog, frozen: Record<DateKey, true> }
```

The engine (`src/domain/streaks.ts`) applies one set of rules everywhere:

1. A completed day adds 1 to the streak (a bonus check-off on a rest day counts too).
2. A **scheduled past** day that is neither completed nor frozen is *missed* and resets the streak.
3. **Today is never missed** – until midnight it is *pending*, so the streak shown at 00:01 is still yesterday's.
4. Rest days, paused days, frozen days and days before `creationDate` are neutral bridges.
5. Days are **local calendar keys**, not timestamps. A check-off at 23:59 belongs to that day, 00:00 to the next.
   Arithmetic is on UTC day indexes, so 23-/25-hour DST days can't cause off-by-one errors. Tests prove this
   in explicit IANA zones and by running the whole suite under six process time zones.

**Midnight rollover:** `useToday()` fires a timer at the next local midnight and re-checks whenever the app
returns to the foreground (timers freeze in the background; the device TZ may have changed). Today's list,
streaks and the date strip re-derive automatically; nothing cached can go stale because streaks are always
computed from the log.

**Returning after inactivity (e.g. 3 days away):** `analyzeReturn()` compares `lastActiveDate` with today,
lists every streak that died in the gap (with its previous length and missed days) and whether it can be
saved with freezes (2 per habit per month, misses within the last 7 days). The *Welcome back* sheet offers
"Use N freezes to repair" or "Start fresh". Longest streaks are always preserved.

Other edge cases handled: no logging in the future or before a habit existed, clock skew (future-dated
entries ignored), multi-rep targets (tap increments, full count completes), pausing/resuming (pause days are
neutral, reminders cancelled), completing a frozen day refunds the freeze, backfilling past days from the
calendar, deleting a habit cancels its reminders.

---

## 5. Screens

- **Today** – header with brand mark, momentum flame and avatar · scrollable date strip (backfill past days;
  dot = none / partial / perfect) · *Today's Orbit* card with animated progress ring · horizontal **Streak
  Highlights** · habits grouped *Morning / Focus & Body / Evening / Anytime* by reminder time · animated
  check target (fill, pop, ripple, haptic) with strike-through title and a rolling, glowing streak badge ·
  daily creed · New Habit.
- **Analytics** – Weekly/Monthly/Yearly/All-Time · completion % with delta vs previous period and sparkline ·
  active/broken streaks · perfect days · reps vs target · Weekly Momentum pill bars (weakest day in orange,
  best-day insight) · **Completion Trend** and **Streak History** line charts (react-native-chart-kit, tap for
  tooltip) · milestones & badges · streak telemetry leaderboard with PB tags · chain banner.
- **Habit detail** – current & longest streak (with "Best: <month>"), total sessions, consistency, month
  calendar with chain connectors / frozen snowflakes / misses (tap a day to backfill, clear or freeze),
  reminder & category rows, freezes, *Log Session*, *Pause/Resume*, overflow menu.
- **New / Edit habit** – name, icon presets, category tag, Daily/Weekdays/Weekends/Custom (day picker),
  target repetition stepper, smart reminder, detail, glow colour, momentum forecast, validation.
- **Explore** – your habits (paused badges), template library (one-tap add), export JSON backup, sample data,
  reset.

---

## 6. Accounts & sync (optional, FastAPI backend)

The app never needs a network. Logging in is optional (Settings → **Account & sync**) and connects it to the
Python **FastAPI** server in `../backend` — see the root `README.md` for how to start it.

- **Offline-first stays true:** the device's SQLite is still what the screens read and write. While logged in,
  each change is also put in an offline queue (`sync_outbox` table) and pushed to the server in order. If the
  server can't be reached, changes wait in the queue — even across app restarts — and are sent later.
- **Phone ↔ web:** the app syncs on launch, when it returns to the foreground, every 30 s while open, and on
  *Sync now*. Changes made on another device are pulled in (and reminders on this phone are rescheduled).
- **Log in on a device that already has habits:** they are merged into the account (nothing is lost:
  habits unioned by id, highest count per day wins, freezes kept unless the day is complete).
- **Log out:** choose to keep a copy on the device or remove it. The account keeps everything.
- **Server address:** found automatically (web: same computer, port 8000; Expo Go: the computer from the QR
  code). Override it on the Account screen or with `EXPO_PUBLIC_API_URL=http://<ip>:8000` in `frontend/.env`.
  Tunnel mode (`--tunnel`) can't reach port 8000 — use LAN mode on the same Wi-Fi.
- Code: `src/api` (typed client, errors), `src/sync/ops.ts` (state diff → operations, pure),
  `src/sync/engine.ts` (queue, push/pull, login/merge, expiry), `src/app/account.tsx` (screen).
- Tests: `src/sync/__tests__/ops.test.ts` (pure) and `engine.test.ts`, which **starts the real backend**
  from `../backend/.venv` on a random port and checks sign-up upload, push, pull without echo, offline queue,
  restart with a queued change, edits during a download, refused changes, merge, expired sessions, logout and
  account deletion. It is skipped if the backend's virtual environment doesn't exist yet.

---

## 7. Notes & known limits

- Design copy that claimed facts we can't back (e.g. "Top 5% of users", "Science shows…") was replaced with
  data the app actually has ("N to beat your best", "Personal best!").
- The Stitch "Custom 3x" cadence is implemented as specific weekdays (default Mon/Wed/Fri) so streaks stay
  well-defined.
- Local reminders are skipped on web; haptics are no-ops on web.

---

## 8. Personalisation (Settings)

Open **Settings** from the profile picture (top-right) or **Explore → Settings & profile**.

| Setting | What it does |
|---|---|
| Profile | Your name (shown as initials) and an optional photo from your gallery, stored privately on the phone |
| Appearance | System / Dark / Light theme — the whole app re-colours instantly |
| Language | English, हिन्दी, বাংলা — every screen, chart, date and reminder text |
| Week starts on | Monday or Sunday — affects weekly stats, the Weekly Momentum bars, the calendar and the day picker |
| Streak freezes per month | 0–5 per habit (0 turns freezes off); used by the calendar and the "welcome back" repair |
| Category tags | Six built-in tags plus your own (add here or while creating a habit; remove with ×) |
| Reminders | Per habit: time **and** your own message (falls back to a translated default) |
| Your data | Export a `.json` backup (share to Drive/WhatsApp/email), restore it on any phone (Merge or Replace), sample data, reset |

Preferences are stored separately from habit data, so resetting habits keeps your settings, and backups carry both (except the photo, which is device-only).
Translations live in `src/i18n/` (`en.ts`, `hi.ts`, `bn.ts`); a missing key is a compile error and a test checks every placeholder matches.

---

## 9. Database (SQLite, on each device)

All data is stored in a local SQLite database file, **`focus-flow.db`**, using `expo-sqlite`:

- **Phone (Android / iOS):** a normal SQLite file inside the app's private storage.
- **Website:** the same SQL engine compiled to WebAssembly, saved in the browser's private storage for that site.

Each device keeps **its own** database. To share data between the phone and the website, either log in to the same account on both (§6, needs the backend running) or use **Export backup file** on one and **Restore from backup** on the other.

**Tables** (`src/db/schema.ts`): `habits`, `pauses`, `completions` (habit × day × count), `freezes`, `settings` (key → JSON), `app_meta` (also holds the login), `sync_outbox` (changes waiting for the server; v2). Foreign keys cascade, so deleting a habit removes its history. The schema version is kept in `PRAGMA user_version`; add new migrations at the end of the list.

**How it works:** on launch `src/db/index.ts` opens and migrates the database, loads it into the Zustand stores, and then mirrors every change back to SQLite (`src/db/sync.ts` compares the previous and next state and writes only what changed, inside a transaction). Users of the earlier AsyncStorage version are migrated automatically the first time (their old copy is left untouched).

**See it:** Settings → Your Data shows the file name and live row counts. In development, press **Shift + M** in the Expo terminal → *Open expo-sqlite* to browse the tables and run SQL.

**Web hosting note:** browsers only allow SQLite's storage when the page is served with these two headers. `metro.config.js` adds them for `npx expo start`; a deployed website must send them too:

```
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

**Tests:** `src/db/__tests__` runs the real SQL against Node's built-in SQLite (Node 22.13+): schema, round-trips, cascades, rollback, a full write-through session, and the one-time migration.
