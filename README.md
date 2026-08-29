# Taraz · تراز

**An offline-first personal finance tracker for Android, built for one user.**

Taraz reads Iranian bank SMS, turns each message into a structured transaction, and lets you
categorize it in one tap from the Android notification shade — without opening the app. It tracks
who owes whom (company purchases you fronted, bills split with friends) and exports a compact,
LLM-ready summary you can paste straight into a chat.

Everything stays on the device. No server, no account, no network dependency.

> The app's interface is Persian and RTL by design. This README and the project docs are English.

---

## Status

| Phase                                                        | State                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1 — Foundation (Dexie schema, money/Jalali utils, RTL shell) | ✅ Done                                                                    |
| 2 — Categorization (projects, tags, splits, claims)          | ⬜ Not started                                                             |
| 3 — Parsing (ParseRule engine, RegEx Studio)                 | 🟡 Minimal parser in place, not yet data-driven                            |
| 4 — Native (Capacitor, SMS plugin, actionable notifications) | 🟡 SMS reading works; background receiver and notification actions pending |
| 5 — Output (category rules, summary, AI export, backup)      | ⬜ Not started                                                             |

See [`docs/PRD.md`](docs/PRD.md) for the full product requirements and the reasoning behind each
decision.

## How SMS capture works today

1. The `SmsReader` Capacitor plugin requests `READ_SMS` / `RECEIVE_SMS` and can read the device
   inbox.
2. The SMS tab groups the inbox by sender and shows only senders with at least one parseable
   message; you pick which senders to import, so non-bank messages are never stored.
3. Each message is normalized (Persian/Arabic digits → ASCII, character folding), then parsed for
   amount, direction, balance, card tail, and a Jalali timestamp. The declared unit decides Rial vs
   Toman; all storage is integer Rial.
4. Parsed messages become `pending` transactions, deduplicated by same sender + same body within
   60 seconds. The raw text is always retained so a better rule can re-parse it later.
5. While the app is running, a `BroadcastReceiver` forwards incoming SMS to the WebView live.

**Not yet built:** the manifest receiver that fires with the app process dead, and the actionable
notification that categorizes a transaction without opening the app. Those are the point of the
product — see PRD §4.3.

## Tech stack

| Layer        | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Toolchain    | [Vite+](https://viteplus.dev) (`vp`) — dev, build, test, lint, format |
| UI           | React 19 + TypeScript + React Compiler                                |
| Styling      | Tailwind CSS v4                                                       |
| Storage      | Dexie / IndexedDB                                                     |
| Native shell | Capacitor 8 (Android only — iOS forbids SMS access)                   |
| Dates        | `date-fns-jalali`                                                     |
| CI           | GitHub Actions — debug APK on every push to `main`                    |

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
