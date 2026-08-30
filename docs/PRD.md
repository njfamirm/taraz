# Taraz — Personal Finance Tracker

**Product Requirements Document**
Version 0.1 · Status: Draft · Owner: S. Amir Mohammad Najafi

---

## 1. Summary

Taraz is a **single-user, offline-first personal accounting app for Android**. It ingests
Iranian bank SMS notifications, turns them into structured transactions, and **notifies the user
the moment one is captured** so it can be reviewed and categorized immediately, in a couple of taps
from the notification.

On top of raw bookkeeping it tracks **who owes whom**: expenses paid on behalf of a company or a
friend, and bills split between several people. Everything lives on the device. There is no
server, no account, and no network dependency.

The final output of the system is not a dashboard — it is a **clean, dense text export designed to
be pasted into an LLM chat** for analysis, budget-leak detection, and charting.

### Design principles

1. **Zero-friction capture.** Capture is fully automatic: the user never types a transaction that
   arrived by SMS. The notification carries the user straight to the pending transaction, and
   categorizing it must cost a couple of taps — never navigation and searching.
2. **Offline and local.** No backend, no sync, no telemetry. The device is the source of truth.
3. **Radically simple.** Personal tool for one user. No multi-tenancy, no auth, no roles, no
   permissions model, no i18n framework. Persian and RTL only.
4. **The LLM is the analytics engine.** We do not build charts, forecasting, or ML. We build a
   very good exporter and let a language model do the reasoning.
5. **Rules over intelligence.** Auto-categorization is deterministic user-authored rules, not a
   model. The user can read, test, and edit every rule.

### Explicit non-goals

- Multi-user, sharing, or collaboration
- Cloud sync or web access
- iOS support (Android only — iOS forbids SMS access entirely)
- Bank API / Open Banking integration
- Built-in charts and analytics dashboards
- Invoicing, payroll, tax filing, or double-entry accounting
- Google Play Store distribution (the `READ_SMS` permission makes this impractical;
  distribution is sideloaded APK)

---

## 2. Users and context

**One user: the developer.** A freelance/contract software engineer in Iran who:

- Receives bank SMS from several banks and cards for every transaction
- Frequently pays for things on behalf of a client company, expecting reimbursement
- Frequently splits bills with friends (food, trips, shared subscriptions)
- Wants a monthly picture of real personal spending — with reimbursables excluded
- Already uses LLM chats daily and wants to feed them financial data

**Environment:** Android phone, Persian language, RTL UI, Jalali (Shamsi) calendar,
Iranian Rial / Toman amounts, Persian and Arabic-Indic digits in incoming SMS.

---

## 3. Core concepts and data model

### 3.1 Transaction

The central record. Created from an SMS, or entered manually.

| Field                     | Type                                      | Notes                                                             |
| ------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `id`                      | string (uuid)                             |                                                                   |
| `amount`                  | integer                                   | Stored in **Rial**, always positive. Sign comes from `direction`. |
| `direction`               | `'in' \| 'out'`                           | Income vs expense                                                 |
| `occurredAt`              | integer (epoch ms)                        | Transaction time as parsed from SMS, else receipt time            |
| `balanceAfter`            | integer \| null                           | Account balance reported by the SMS, when present                 |
| `accountId`               | string \| null                            | Which card/account (see 3.2)                                      |
| `counterparty`            | string \| null                            | Merchant / person / destination — **entered by the user**         |
| `rawText`                 | string \| null                            | Verbatim SMS body — never modified, used for re-parsing           |
| `rawSender`               | string \| null                            | SMS originating address                                           |
| `source`                  | `'sms' \| 'manual' \| 'import'`           |                                                                   |
| `status`                  | `'pending' \| 'categorized' \| 'ignored'` | `pending` = needs review                                          |
| `projectId`               | string \| null                            | See 3.3                                                           |
| `tagIds`                  | string[]                                  | See 3.4                                                           |
| `note`                    | string \| null                            | Free text                                                         |
| `splitId`                 | string \| null                            | Link to a Split record (3.5)                                      |
| `parseConfidence`         | number                                    | 0–1, from the rule that matched                                   |
| `matchedRuleId`           | string \| null                            | Which parse rule produced this record                             |
| `createdAt` / `updatedAt` | integer                                   |                                                                   |

**Invariants**

- A transaction created from SMS always retains `rawText`. Re-parsing must be possible after the
  user fixes a regex, without data loss.
- Deduplication: two SMS with identical `(rawSender, rawText, occurredAt within 60s)` produce one
  transaction. Banks re-send.
- `status: 'pending'` is the app's inbox. The primary UI surfaces this count.

### 3.2 Account

A card or bank account the user owns.

| Field      | Type           | Notes                                           |
| ---------- | -------------- | ----------------------------------------------- |
| `id`       | string         |                                                 |
| `title`    | string         | e.g. "Blu — personal"                           |
| `bankKey`  | string         | Which bank profile (`blu`, `melli`, `saman`, …) |
| `last4`    | string \| null | Card tail, used to route incoming SMS           |
| `color`    | string         | UI accent                                       |
| `archived` | boolean        |                                                 |

Accounts are inferred: when an SMS reports a card tail we have not seen, the app offers to create
the account rather than silently dropping the transaction.

### 3.3 Project

A cost center. The user's real need is separating **company/client spending from personal
spending**.

| Field                  | Type                                | Notes                                                           |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `id`, `title`, `color` |                                     |                                                                 |
| `kind`                 | `'personal' \| 'client' \| 'other'` |                                                                 |
| `defaultReimbursable`  | boolean                             | If true, new transactions on this project default to 100% claim |
| `archived`             | boolean                             |                                                                 |

### 3.4 Tag

Free-form, flat labels (`#food`, `#transport`, `#lunch`, `#subscription`). Deliberately **not
hierarchical** — nesting is a maintenance burden that pays off only at scale this app will never
reach. A transaction may carry several tags.

### 3.5 Split & Claim — the reimbursement engine

This is the feature that makes Taraz different from a generic expense tracker.

**Person** — a counterparty in a debt relationship.

| Field                 | Type                    |
| --------------------- | ----------------------- |
| `id`, `name`, `color` |                         |
| `kind`                | `'person' \| 'company'` |

**Split** — how one transaction's cost is divided.

| Field           | Type                                              | Notes |
| --------------- | ------------------------------------------------- | ----- |
| `id`            | string                                            |       |
| `transactionId` | string                                            |       |
| `mode`          | `'full-claim' \| 'equal' \| 'percent' \| 'exact'` |       |
| `shares`        | `Share[]`                                         |       |

**Share**

| Field            | Type            | Notes                         |
| ---------------- | --------------- | ----------------------------- |
| `personId`       | string \| null  | `null` means "me"             |
| `amount`         | integer         | Rial, computed from mode      |
| `settledAt`      | integer \| null | When this share was paid back |
| `settlementNote` | string \| null  |                               |

**The four modes**

1. **`full-claim` (proxy purchase).** The user paid, but the entire amount belongs to someone
   else — typically a company purchase. The user's own share is zero. **This amount is excluded
   from the user's real expenses** and appears as an open claim until settled.
2. **`equal`.** Split evenly across N people including the user. The user's share is an expense;
   every other share is an open claim.
3. **`percent`.** Shares defined by percentage. Must sum to 100%.
4. **`exact`.** Shares defined as explicit amounts. Must sum to the transaction amount.

**Rounding rule:** Rial amounts are integers. When a split does not divide evenly, the remainder
is assigned to the user's own share — never to a counterparty. A person should never be asked for
a number the app invented.

**Settlement.** A share is closed by stamping `settledAt`. Settlement is per-share, not per-
transaction: one friend can pay back while another has not. A "settle all with X" action closes
every open share belonging to person X in one operation and records the total.

**Derived quantities** (never stored, always computed):

- `realExpense(transaction)` = user's own share, or the full amount when there is no split
- `openClaims(person)` = Σ unsettled shares for that person
- `netPosition(person)` = what they owe the user minus what the user owes them

---

## 4. Feature specifications

### 4.1 SMS ingestion

**Mechanism.** A custom Capacitor plugin with an Android `BroadcastReceiver` on
`android.provider.Telephony.SMS_RECEIVED`. Requires `RECEIVE_SMS` and `READ_SMS`.

**Why a custom plugin rather than a community one:** we need the receiver to run and post an
notification even when the WebView is not alive. Off-the-shelf inbox-reader plugins assume a
foreground JS context. A ~200-line native plugin we control is more predictable than a dependency we
do not.

**Flow**

1. SMS arrives → the manifest receiver fires (works with the app closed; Android wakes it).
2. The sender is checked against the approved-sender list, a copy of which the app keeps in native
   preferences precisely so this decision can be made with the WebView dead. Anything else is
   dropped on the spot and never stored — a hard privacy requirement.
3. The raw message is appended to a small native queue and a **capture notification** (4.3) is
   posted. The receiver does no parsing and writes no ledger state; it cannot, because the ledger
   is IndexedDB inside the WebView.
4. When the app next starts — by the notification tap or any other way — it drains the queue,
   runs each message through the parse rules (4.2), and persists a `pending` transaction per
   message, deduplicated as usual.
5. A message that fails to parse still lands as a `pending` transaction with `parseConfidence: 0`
   and its raw text intact, so a new rule can be written and applied retroactively.

While the app is in the foreground the background path stands down: the in-process receiver hands
messages straight to the WebView, so nothing is queued and no notification is posted.

**Bootstrap import.** On first run, offer a one-time read of the existing SMS inbox to backfill
history. The user picks a date range and the accounts to import.

**Privacy constraints (non-negotiable)**

- Only SMS from senders on the bank list are read or stored.
- No SMS content ever leaves the device by any automatic path.
- The AI export (4.6) is a manual, user-initiated clipboard copy and contains **aggregates and
  transaction summaries — never raw SMS text**.

### 4.2 Parse rules & RegEx Studio

Every bank formats its SMS differently, and formats change. Parsing must be user-editable data,
not code.

**ParseRule**

| Field           | Type                      | Notes                                       |
| --------------- | ------------------------- | ------------------------------------------- |
| `id`, `title`   |                           |                                             |
| `bankKey`       | string                    |                                             |
| `pattern`       | string                    | Regex with **named capture groups**         |
| `directionHint` | `'in' \| 'out' \| 'auto'` | `auto` derives direction from a keyword map |
| `enabled`       | boolean                   |                                             |
| `priority`      | integer                   | Lower runs first; first match wins          |

**Recognized capture groups:** `amount`, `balance`, `date`, `time`, `card`, `direction`.

**Rules are matched on text, never on sender.** A sender is a phone number that differs per user and
changes over time, so it identifies nothing reliably. Which numbers the app may read is a separate,
purely permission-side decision — the approved-sender list (4.1) — and the parser never consults
it.

A bank SMS says how much moved and in which direction. **It is not a source of truth for what the
money was for**, and the app does not pretend otherwise: no merchant sniffing, no keyword guessing,
no purpose inferred from the text. What a transaction was for is the user's to say.

**Normalization pipeline** applied to every capture, in order:

1. Persian (`۰۱۲…`) and Arabic-Indic (`٠١٢…`) digits → ASCII
2. Strip thousands separators (`,` `٬` and spaces)
3. Arabic/Persian character folding (`ي`→`ی`, `ك`→`ک`, ZWNJ handling)
4. Amount unit resolution — **the single most dangerous step.** Iranian SMS quote both Rial and
   Toman. Each rule declares its unit explicitly (`rial` | `toman`); there is no guessing. All
   storage is Rial.
5. Jalali date → epoch ms

**RegEx Studio** — a settings screen where the user can:

- Pick a starter template per bank (Blu, Melli, Saman, Pasargad, Mellat, Tejarat, …)
- Write and edit a regex with live capture-group highlighting
- Paste a real SMS and see the parsed result **immediately**, field by field, with the normalized
  values shown next to the raw captures
- Run a rule against all stored `rawText` and preview how many transactions it would newly match
  or re-match before applying
- Reorder priority and enable/disable rules

**Re-parse.** Any rule change offers to re-run against historical raw text. Re-parsing never
overwrites fields the user edited by hand — manual edits win, always.

### 4.3 Capture notifications

When a transaction is captured, the app posts a notification so the user knows immediately and can
act while the purchase is still fresh:

```
┌──────────────────────────────────────┐
│  برداشت ۲۵۰,۰۰۰ تومان                │
│  بلو · موجودی ۴,۱۲۰,۰۰۰              │
│  برای ثبت ضربه بزنید                 │
└──────────────────────────────────────┘
```

- The notification's job is **detection and hand-off**, nothing more: it says a transaction arrived
  and shows enough of it (amount, direction, sender) to be recognized.
- Tapping it opens the app, which ingests the queued message and lands **directly on that
  transaction's detail sheet**, ready for categorization. There is no hunting through a list.
- The notification's headline is rendered natively from the message text (amount, direction, unit)
  purely for recognizability, and falls back to the bank's own first line. It is display only —
  the authoritative parse always runs in JS on the raw text.
- Ignoring the notification leaves the transaction `pending` in the inbox. Nothing is lost.
- The notification body must render correctly in RTL with Persian digits and grouped thousands.

**Why there are no categorize-from-the-shade buttons.** An earlier version of this document
promised action buttons that would file a transaction without opening the app. That is not
achievable in this architecture and the claim has been removed. All app state — accounts, projects,
tags, split rules, the ledger itself — lives in IndexedDB inside the WebView. A notification action
handled natively can see none of it and cannot write a transaction; delivering the tap to JavaScript
means starting the app process anyway, at which point the "without opening the app" property is
gone. Categorization therefore always happens in the app, and the design goal is to make that path
as short as possible rather than to pretend it can be skipped.

### 4.4 Auto-categorization rules

Deterministic rules evaluated at capture time, before the notification is posted. A matched rule
pre-fills the category, and the notification says so, so a correctly auto-categorized transaction
needs no action at all (the user can still open it and override).

**CategoryRule**

| Field                                | Type                                         | Notes          |
| ------------------------------------ | -------------------------------------------- | -------------- |
| `id`, `title`, `enabled`, `priority` |                                              |                |
| `conditions`                         | `Condition[]`                                | ANDed together |
| `actions`                            | `{ projectId?, tagIds?, splitMode?, note? }` |                |

**Condition kinds**

- `amountBetween` — min/max in Rial
- `timeOfDay` — a window like 12:00–14:00 → `#lunch`
- `dayOfWeek`
- `account` — matches a specific card
- `direction`

Conditions are about the shape of the transaction — amount, time, account, direction — never about
what the message text seems to mean. Rules are pure data, listed in a settings screen with the same
"preview against history" affordance as parse rules. There is no learning loop and no hidden state — if a rule fires, the user can point
at exactly which one and why.

### 4.5 App screens

1. **Inbox (home).** The `pending` queue, newest first. This is the landing screen because
   clearing it is the daily job. Empty state is a win state, not a blank page.
2. **Transactions.** Full ledger with filters (date range, account, project, tag, direction,
   settled/unsettled) and search over counterparty and note.
3. **Transaction detail.** Amount, parsed fields, raw SMS, category editing, split editor,
   note. Shows which parse rule matched, with a shortcut into RegEx Studio.
4. **Claims.** Grouped by person: open balance per person, the transactions behind it, and
   settle actions (per share or "settle all").
5. **Summary.** A deliberately thin month view: net in/out, real expense (claims excluded),
   spending by project and by tag, open-claims total. Numbers only — **charts are the LLM's job**.
6. **Settings.** Accounts, projects, tags, people, parse rules (RegEx Studio), category rules,
   notification preferences, backup/restore.

**UI conventions**

- Persian, RTL, Vazirmatn.
- Amounts displayed in **Toman** with Persian digits and thousands separators; stored in Rial.
- Jalali dates throughout, with relative labels ("امروز", "دیروز") for recent items.
- Mobile-first, thumb-reachable primary actions, no hover-dependent affordances.
- Dark mode follows the system setting.

### 4.6 AI-ready export

One button produces a compact, LLM-optimized text block and copies it to the clipboard.

**Requirements**

- User picks a period (this Jalali month, last month, custom range).
- Two formats: **Markdown** (readable, good for chat) and **compact JSON** (good for precise
  analysis). Same content, same numbers.
- The export must be **self-describing**: it states its own units, its date system, and the
  meaning of "real expense" vs "claims", so the model does not have to guess.
- The export contains: period header and unit declaration; income/expense/net totals; real expense
  with reimbursables excluded; breakdown by project; breakdown by tag; a daily series compact enough
  to chart; open claims per person; the largest N transactions; and counts of `pending` and
  `unparsed` items so the model knows how complete the data is.
- **No raw SMS text, no card numbers, no account identifiers.** Titles and notes the user wrote
  are kept, because they carry the analytical signal.
- Target size: a normal month must fit comfortably in a chat message.

### 4.7 Backup & restore

- Export the full database as a single JSON file, including rules and settings.
- Import with a mode choice: replace everything, or merge by `id`.
- Manual only. Local file. No cloud.
- Because the device is the only copy, the app should nudge for a backup when a month closes.

---

## 5. Technical architecture

| Layer         | Choice                                      | Rationale                                                                           |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Toolchain     | **Vite+ (`vp`)**                            | One CLI for dev, build, test, lint, format, package management                      |
| UI            | **React 19 + TypeScript + React Compiler**  | Free memoization; large component ecosystem                                         |
| Styling       | **Tailwind CSS v4**                         | Utility-first, tiny output, first-class RTL support                                 |
| Storage       | **Dexie / IndexedDB**                       | No native build step; inspectable in a browser; ample for tens of thousands of rows |
| Native shell  | **Capacitor 8**                             | Android packaging + native plugin surface                                           |
| Notifications | **`@capacitor/local-notifications`**        | Posting capture notifications and routing the tap into the app                      |
| SMS           | **Custom Capacitor plugin**                 | `BroadcastReceiver`, must run with the WebView dead                                 |
| Dates         | **Jalali library** (e.g. `date-fns-jalali`) | Shamsi calendar throughout                                                          |
| CI            | **GitHub Actions**                          | Builds a debug APK on every push, uploaded as an artifact                           |

### Rejected alternatives and why

- **Astro** — the original plan. Dropped: there is no SSR, no static content, and no routing story
  that a plain SPA does not cover better. It was pure overhead for a Capacitor shell.
- **`@capacitor-community/sqlite`** — real SQL, but a heavier native build and much worse
  debuggability in the browser. Aggregations over a personal ledger are trivial in JS. Revisit only
  if row counts or query complexity actually justify it.
- **A community SMS plugin** — faster to start, but the maintenance and Capacitor-8 compatibility
  are outside our control for the single most critical code path in the app.

### Architectural rules

- **The database schema is the contract.** Everything else is a view over it. UI changes must not
  require migrations.
- **Parsing and categorization are data, not code.** No bank format is ever hardcoded in a
  component.
- **Raw text is immutable and always retained.** Every parsing decision must be reversible.
- **All money is integer Rial.** No floats anywhere in the money path. Formatting to Toman happens
  only at the render boundary.
- **Capture must work with the app process dead.** Receiving, parsing, persisting, and notifying
  cannot assume a live WebView.
- **Categorization always runs in the app.** Native code never writes ledger state; the
  notification only routes the user to it.

---

## 6. Delivery plan

**Phase 1 — Foundation**
Vite+ app scaffold, Tailwind v4, RTL shell, Vazirmatn, Dexie schema and repositories, money and
Jalali-date utilities, manual transaction entry, transaction list. Runs in a browser; no native
code yet.

**Phase 2 — Categorization**
Projects, tags, transaction detail, the split/claim engine, the claims screen and settlement flow.
Still browser-only, fully usable via manual entry.

**Phase 3 — Parsing**
Parse-rule engine, the normalization pipeline, bank templates, RegEx Studio with live preview and
re-parse. Fed by pasting SMS text by hand — this proves the parser before any native work starts.

**Phase 4 — Native**
Capacitor Android integration, the custom SMS plugin, capture notifications and deep-linking into
the transaction detail sheet, first-run inbox import, and the GitHub Actions APK build.

**Phase 5 — Output**
Category rules, the summary screen, the AI export in both formats, backup and restore.

Each phase ends with something the user can actually run. Phases 1–3 are verifiable on a laptop,
which keeps the slow native loop out of the critical path for as long as possible.

---

## 7. Open questions

1. **Post-tap speed.** Since categorization always happens in the app, how few taps can the
   transaction detail sheet get to for the common cases (company claim, food, split)?
2. **Doze mode.** Aggressive Android battery management may delay the receiver on some OEM ROMs
   (Xiaomi, Samsung). Do we need a foreground service, or is a documented battery-optimization
   exemption sufficient?
3. **Bank format drift.** When a bank silently changes its SMS format, transactions land as
   `pending` with confidence 0. Is a passive inbox count enough of a signal, or should the app
   actively flag a sustained parse-failure rate?
4. **Multi-currency.** Does anything need to be tracked in USD/EUR, or is Rial-only correct
   permanently?
5. **Historical import depth.** How far back should the initial SMS inbox import reach, and does the
   phone even retain that history?

---

## Appendix A — Capacitor reference (adapted from a prior project)

A working Capacitor + GitHub Actions setup already exists in the author's `nexim` project. It is a
useful starting point, but **three of its decisions must be inverted for Taraz**. They are called
out below so the differences are not copied by accident.

### A.1 What carries over unchanged

- **Toolchain versions.** Capacitor 8.5, Node 22+, JDK 21 (Zulu), `assembleDebug`, APK uploaded as a
  workflow artifact. Proven combination.
- **The `cap add android` / `cap sync android` shape.** `android/` is generated, not committed;
  the workflow creates it when absent and syncs on every run.
- **Icon generation via `@capacitor/assets`.** `assets/icon-only.png`, `logo.png`, and
  `icon-foreground.png` drive `npx @capacitor/assets generate --android`.
- **Permission handling pattern.** `LocalNotifications.checkPermissions()` first, then
  `requestPermissions()` only if not already granted, all wrapped so a denial degrades quietly
  instead of throwing.
- **The `localNotificationActionPerformed` listener** as the single entry point for
  "user tapped a notification", used here purely for routing to a transaction.

### A.2 What must be inverted

**1. No remote `server.url`. This is the critical one.**

The nexim config points the WebView at a live site:

```ts
// nexim — WRONG for Taraz
server: {
  url: globalConfig.url.customerPanelUrl,
  cleartext: true,
  allowNavigation: [customerUrl.hostname],
}
```

That makes the app a thin browser over a hosted panel. Taraz is offline-first: the bundle ships
inside the APK and there is no server to reach. The whole `server` block is dropped, and the
placeholder `dist/index.html` with the redirect-to-`dev.mynexim.ir` spinner is deleted along with
it — Taraz's `dist/` is a real build or the workflow should fail loudly.

```ts
// capacitor.config.ts — Taraz
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ir.njfamirm.taraz",
  appName: "ترازو",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

**2. Notifications carry a transaction id and route into the app.**

nexim posts a notification that opens a route on tap, and that shape is exactly right for Taraz —
carry the transaction id in `extra` and navigate to its detail sheet:

```ts
await LocalNotifications.schedule({
  notifications: [
    {
      id: notificationId,
      title: formatAmountLine(txn),
      body: "برای ثبت ضربه بزنید",
      extra: { transactionId: txn.id },
    },
  ],
});
```

The listener reads `notification.extra.transactionId` and navigates. **No `actionTypes` and no
action buttons.** A button that categorizes from the shade was in an earlier draft; it cannot work,
because the ledger lives in IndexedDB inside the WebView and a native action handler can neither
read nor write it — see 4.3.

**3. Drop the aggressive background polling.**

nexim polls a chat endpoint every 30 seconds and syncs on every foreground/background transition,
because it has a server to poll. Taraz has none. Its wake-up source is the SMS
`BroadcastReceiver` — event-driven, not timer-driven. Any periodic task in Taraz would burn battery
for nothing.

### A.3 The workflow, adapted

Same skeleton as nexim's `build-android.yaml`, with these changes: **pnpm instead of yarn**
(`pnpm/action-setup` + the pnpm store cache), **no `working-directory: packages/app`** since Taraz
is not a monorepo, **no `FORCE_FETCH_CONFIG`** and no `global-config` package, and **no fabricated
`dist/index.html` fallback** — if `vp build` did not produce a bundle, that is a real failure and the
job should stop.

```yaml
name: Build Android APK

on:
  push:
  workflow_dispatch:

jobs:
  build-android:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: actions/setup-java@v5
        with:
          distribution: zulu
          java-version: "21"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Sync Capacitor Android
        run: |
          test -f dist/index.html || { echo "build produced no bundle"; exit 1; }
          [ -d android ] || pnpm exec cap add android
          [ -d assets ] && pnpm exec @capacitor/assets generate --android --assetPath assets
          pnpm exec cap sync android
      - run: chmod +x android/gradlew
      - working-directory: android
        run: ./gradlew assembleDebug --stacktrace
      - uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

### A.4 Android manifest additions (Taraz-specific, absent from nexim)

nexim needed no dangerous permissions. Taraz needs SMS access plus a receiver that survives the app
process being dead:

- `<uses-permission android:name="android.permission.RECEIVE_SMS" />`
- `<uses-permission android:name="android.permission.READ_SMS" />`
- `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (Android 13+)
- A `<receiver>` for `android.provider.Telephony.SMS_RECEIVED` with
  `android:exported="true"` and `android:permission="android.permission.BROADCAST_SMS"`

`.gitignore` additions, following the nexim pattern: `android/` and `assets/` are generated and stay
out of the repo.
