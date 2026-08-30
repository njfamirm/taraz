# Taraz · تراز

**An offline-first personal finance tracker for Android, built for one user.**

Taraz reads Iranian bank SMS, turns each message into a structured transaction, and notifies you
the moment one arrives so you can tap the notification and register it in a couple of taps. It
tracks who owes whom (company purchases you fronted, bills split with friends) and exports a
compact, LLM-ready summary you can paste straight into a chat.

Everything stays on the device. No server, no account, no network dependency.

> The app's interface is Persian and RTL by design. This README and the project docs are English.

---

## Status

| Phase                                                        | State                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| 1 — Foundation (Dexie schema, money/Jalali utils, RTL shell) | ✅ Done                                                         |
| 2 — Categorization (projects, tags, splits, claims)          | ⬜ Not started                                                  |
| 3 — Parsing (ParseRule engine, RegEx Studio)                 | 🟡 Minimal parser in place, not yet data-driven                 |
| 4 — Native (Capacitor, SMS plugin, capture notifications)    | ✅ Inbox import, background receiver, and capture notifications |
| 5 — Output (category rules, summary, AI export, backup)      | ⬜ Not started                                                  |

See [`docs/PRD.md`](docs/PRD.md) for the full product requirements and the reasoning behind each
decision.

## How SMS capture works

1. The `SmsReader` Capacitor plugin requests `READ_SMS` / `RECEIVE_SMS` / `POST_NOTIFICATIONS` and
   can read the device inbox.
2. The SMS tab groups the inbox by sender and shows only senders with at least one parseable
   message; you pick which senders to import. Importing a sender also **approves** it — from then
   on its new messages are captured in the background. Nothing else is ever read or stored.
3. `SmsCaptureReceiver` is declared in the manifest, so Android wakes it even with the app process
   dead. It drops anything not from an approved sender, appends the raw message to a small native
   queue, and posts a notification.
4. The notification announces the transaction (amount and direction, read natively for display
   only) and tapping it opens the app.
5. On startup the app drains that queue: each message is normalized (Persian/Arabic digits → ASCII,
   character folding), parsed for amount, direction, balance, card tail, and a Jalali timestamp,
   then stored as a `pending` transaction. A message the parser cannot read is still stored, with
   its raw text and a "needs a look" flag, so nothing is lost while a bank's format is unsupported. The declared unit decides Rial vs Toman; all storage is
   integer Rial. Messages are deduplicated by same sender + same body within 60 seconds, and raw
   text is always retained so a better rule can re-parse it later.
6. If the tap came from a notification, the app opens that transaction's detail sheet directly.
7. While the app is in the foreground the background path stands down — the in-process receiver
   feeds the WebView live, so there is no duplicate notification.

**What a transaction was for is never guessed from the SMS.** A bank message says how much moved
and in which direction; that is all the parser takes from it. Categorization is the user's.

**Adding a bank** is adding a profile to [`src/lib/banks.ts`](src/lib/banks.ts) — the words that
bank uses for money leaving and arriving, and any pattern of its own — plus its real messages to
the parser fixtures. The parser itself does not change. Blu is supported today.

A profile says nothing about who sent the message: every pattern is tried against every message and
the text decides. Senders are phone numbers that differ per user and change over time; **which
numbers may be read at all is a permission question**, handled by the approved-sender list, and it
is entirely separate from parsing.

**Categorizing from the notification shade is not possible, by design.** The ledger — accounts,
projects, tags, rules — lives in IndexedDB inside the WebView. A notification action handled
natively can neither read nor write it, and routing the tap to JavaScript starts the app anyway.
The notification detects and hands off; registration happens in the app. See PRD §4.3.

## Tech stack

| Layer        | Choice                                                                            |
| ------------ | --------------------------------------------------------------------------------- |
| Toolchain    | [Vite+](https://viteplus.dev) (`vp`) — dev, build, test, lint, format             |
| UI           | React 19 + TypeScript + React Compiler                                            |
| Styling      | Tailwind CSS v4                                                                   |
| Storage      | Dexie / IndexedDB                                                                 |
| Native shell | Capacitor 8 (Android only — iOS forbids SMS access)                               |
| Dates        | `date-fns-jalali`                                                                 |
| CI           | GitHub Actions — signed release APK, see [`docs/RELEASING.md`](docs/RELEASING.md) |

## Development

```bash
pnpm install
pnpm dev
```

Phases 1–3 are fully verifiable in a browser. The SMS tab has a paste box that runs a message
through the real parser and ingestion path, so you can work on parsing without an Android build.

```bash
pnpm exec vp check   # format, lint, typecheck
pnpm exec vp test    # unit tests
pnpm exec vp build   # production bundle
```

## Android build

```bash
pnpm android:sync    # vp build && cap sync android
pnpm android:open    # open the project in Android Studio
```

CI assembles a debug APK on every push to `main` and publishes it as a rolling `nightly`
pre-release. Distribution is sideloaded APK only — the `READ_SMS` permission makes Play Store
distribution impractical.

## Privacy

These constraints are non-negotiable and are enforced in code, not policy:

- Only messages from senders you explicitly confirm are parsed or stored.
- No SMS content leaves the device by any automatic path.
- The AI export contains aggregates and transaction summaries — never raw SMS text, card numbers,
  or account identifiers.
- There is no analytics, no telemetry, and no network call in the app.

## Project layout

```
src/db/        Dexie schema, types, repositories — the contract everything else is a view over
src/lib/       money (integer Rial), Jalali dates, SMS parsing, ingestion
src/native/    Capacitor plugin bridges
src/screens/   Inbox, Transactions, Summary, SMS import, manual entry
android/       Capacitor Android shell and the native SmsReader plugin
site/          The GitHub Pages download page
docs/PRD.md    Product requirements
```

## License

Personal project, no license granted.
