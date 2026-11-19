# Focus & Flow — Habit Tracker (Expo / React Native)

A production-ready, offline-first habit tracker for **iOS, Android (and web)** built from the Google Stitch
"Kinetic Obsidian" designs in `../Design`. Daily habit list, circular progress, streak highlights,
fluid check-off animations, a persistent bottom nav, a unit-tested streak engine, analytics charts,
streak freezes, reminders and a "welcome back" flow for users returning after days away.

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 · React 19 · Expo Router (file-based) |
| State | Zustand 5 + `persist` middleware |
| Storage | AsyncStorage (offline-first; nothing leaves the device) |
| Animation | Reanimated 4 (UI-thread), expo-haptics |
| Charts | react-native-chart-kit 7 (v2 API) + custom SVG bars/sparklines (react-native-svg) |
| Reminders | expo-notifications (local, repeating) |
| Fonts / icons | Space Grotesk + Plus Jakarta Sans (@expo-google-fonts) · MaterialIcons |
| Cloud (optional) | `src/services/sync.ts` — adapter seam + tested merge for Firebase/GCP |

---

## 1. Run it

Requires Node 20+ and the **Expo Go** app on your phone (or an Android emulator / iOS simulator).

```bash
cd streak-habit
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
streak-habit/
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
   │  └─ habit/[id]/edit.tsx     Edit / delete (modal)
   ├─ domain/                    PURE TypeScript business logic (no React) — fully unit-tested
   │  ├─ types.ts                Habit, TrackingLog, DayStatus, StreakRun …
   │  ├─ dates.ts                DateKey (YYYY-MM-DD) maths, DST-proof, midnight timer helper
   │  ├─ streaks.ts              Streak engine: current / longest / runs / totals / rates
   │  ├─ freezes.ts              Streak freezes + re-entry (inactivity) analysis
   │  ├─ stats.ts                Cross-habit analytics (periods, momentum, weekday rates, badges)
   │  ├─ templates.ts            Habit library + deterministic demo data
   │  ├─ format.ts               Frequency labels
   │  └─ __tests__/              Jest suites
   ├─ store/useHabitStore.ts     Zustand store (raw facts only) persisted to AsyncStorage
   ├─ hooks/useToday*.ts(x)      "Today" that rolls over at local midnight / on resume / on TZ change
   ├─ services/                  notifications, haptics, optional cloud-sync seam
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

## 6. Optional cloud sync (Firebase / GCP)

The app never needs a network. To add accounts and multi-device sync:

1. `npx expo install firebase` and create a Firebase project (Auth + Firestore).
2. Implement `SyncAdapter` from `src/services/sync.ts` (`pull()` / `push()` a `{ habits, logs }` document at
   `users/{uid}`).
3. Call `syncNow(adapter, { habits, logs })` on launch and after writes; write the merged result back with
   `useHabitStore.setState(...)`.

`mergeSnapshots()` is already implemented and tested: completions merge by max count per day, freezes union,
habits union by id. Because days are calendar keys, two devices in different time zones can never disagree
about which day a check-off belongs to.

---

## 7. Notes & known limits

- Design copy that claimed facts we can't back (e.g. "Top 5% of users", "Science shows…") was replaced with
  data the app actually has ("N to beat your best", "Personal best!").
- The Stitch "Custom 3x" cadence is implemented as specific weekdays (default Mon/Wed/Fri) so streaks stay
  well-defined.
- Local reminders are skipped on web; haptics are no-ops on web.
