# Releasing Taraz

Taraz is sideloaded, not shipped through Google Play. This document covers how a build is signed,
why it used to trigger Android's security warnings, and how the in-app updater works.

---

## Why the old builds were flagged

CI used to publish `assembleDebug` output. Three consequences:

| Symptom                                   | Cause                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This app is unsafe" / Play Protect block | A debug APK is marked `android:debuggable="true"` and is signed with the well-known Android debug key. Play Protect flags both.                                                                                                                 |
| Larger download than expected             | `minifyEnabled false`, no resource shrinking, and debug symbols packaged in.                                                                                                                                                                    |
| "App not installed" on every update       | The debug keystore is regenerated from scratch on each GitHub runner, so **every build had a different signature**. Android refuses an update whose signing certificate does not match the installed app. `versionCode` was also pinned at `1`. |

Note that the app requests `READ_SMS` / `RECEIVE_SMS`. These are high-risk permissions, which makes
Play Protect noticeably more aggressive about an unsigned or debug build. They are also
restricted on Google Play, which is why distribution stays outside the store.

The "install from an unknown source" prompt on a **first** install cannot be removed by any of the
changes below — only Play Store distribution removes it. Everything else is fixed.

---

## One-time setup

### 1. Create a release keystore

> **Already done for this repository.** The keystore lives at `~/.taraz-signing/taraz-release.p12`
> (password in `~/.taraz-signing/password.txt`, alias `taraz`, valid until 2054) and all four
> repository secrets are set. Back that directory up somewhere durable — a password manager, an
> encrypted drive — because losing it means no future build can ever update an existing install;
> every user would have to uninstall and reinstall, losing their local data. The steps below record
> how it was made, for a rebuild or a second machine.

A PKCS#12 keystore, which `openssl` can produce without a JDK installed:

```bash
openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes \
  -keyout key.pem -out cert.pem -subj "/CN=Taraz/O=njfamirm/C=IR"
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem \
  -name taraz -out taraz-release.p12
rm key.pem cert.pem
```

With a JDK available, `keytool -genkeypair -keystore taraz-release.p12 -storetype PKCS12 -alias
taraz -keyalg RSA -keysize 4096 -validity 10000` is equivalent. Never commit the keystore.

### 2. Add the GitHub repository secrets

```bash
base64 -i taraz-release.p12 | tr -d '\n' | gh secret set ANDROID_KEYSTORE_B64 --repo njfamirm/taraz
```

Under _Settings → Secrets and variables → Actions_:

| Name                        | Kind     | Value                                     |
| --------------------------- | -------- | ----------------------------------------- |
| `ANDROID_KEYSTORE_B64`      | Secret   | The base64 blob above                     |
| `ANDROID_KEYSTORE_PASSWORD` | Secret   | The keystore password                     |
| `ANDROID_KEY_PASSWORD`      | Secret   | Same as the keystore password for PKCS#12 |
| `ANDROID_KEY_ALIAS`         | Variable | `taraz`                                   |

The alias is a **variable**, not a secret, on purpose: GitHub redacts every secret value wherever it
appears in a log, and an alias of `taraz` would blank out the word everywhere — `***.apk`.

The `android` CI job fails fast with a clear message if `ANDROID_KEYSTORE_B64` is missing.

### 3. Uninstall the old build once

The signing certificate is changing, so the previously installed debug build **cannot** be updated
in place. Uninstall it before installing the first signed release. This wipes the Dexie/IndexedDB
data, so export anything you want to keep first. This is a one-time cost — every release after this
one updates cleanly.

---

## How a build is produced

`android/app/build.gradle` reads its version and signing config from the environment. Absent them, a
local `assembleDebug` still works exactly as before on a fresh clone.

| Variable                                                             | Meaning                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `TARAZ_VERSION_CODE`                                                 | Integer `versionCode`; CI uses `github.run_number`                    |
| `TARAZ_VERSION_NAME`                                                 | Display version; the git tag for releases                             |
| `TARAZ_KEYSTORE_PATH`                                                | Path to the `.p12`; when unset, no release signing config is declared |
| `TARAZ_KEYSTORE_PASSWORD` / `TARAZ_KEY_ALIAS` / `TARAZ_KEY_PASSWORD` | Signing credentials                                                   |

The release build type now uses `minifyEnabled true` + `shrinkResources true`. Capacitor resolves
plugin classes and `@PluginMethod` members reflectively, so `android/app/proguard-rules.pro` keeps
`com.getcapacitor.**` and `dev.njfamirm.taraz.**` intact. **If you add a native plugin whose class
lives outside those packages, add a keep rule for it** or it will vanish under R8.

`versionCode` comes from the workflow run number and therefore only ever increases. Never lower it:
Android rejects a downgrade.

---

## Shipping a release

Two channels, both publishing `taraz.apk` and `update.json`:

- **`nightly`** — every push to `main` refreshes the rolling `nightly` pre-release. This is what the
  landing page links to.
- **Tagged** — pushing a `v*` tag publishes a normal release with generated notes.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The app follows one of them, picked with the **شبانه / پایدار** toggle in Settings and remembered in
`localStorage`. **Nightly is the default**, because `stable` stays empty until the first `v*` tag is
pushed:

| Channel   | Manifest URL                            | Updated by           |
| --------- | --------------------------------------- | -------------------- |
| `stable`  | `releases/latest/download/update.json`  | Pushing a `v*` tag   |
| `nightly` | `releases/download/nightly/update.json` | Every push to `main` |

The nightly release is addressed by its tag on purpose: GitHub's `releases/latest` never resolves to
a pre-release, so the stable channel cannot accidentally serve a nightly build. Both channels share
one `versionCode` counter (the workflow run number), so switching between them is safe — but a
nightly built after the last tag has a higher `versionCode` than the stable release, and moving back
to stable will then report "you are up to date" rather than offering a downgrade. Android would
refuse the downgrade anyway.

### The update manifest

CI generates it next to the APK:

```json
{
  "versionCode": 42,
  "versionName": "0.1.0",
  "apkUrl": "https://github.com/njfamirm/taraz/releases/download/v0.1.0/taraz.apk",
  "releasedAt": "2026-08-30T10:00:00Z"
}
```

An optional `notes` string is rendered under the version heading in the app if present.

---

## The in-app updater

Settings → **به‌روزرسانی** shows the installed version and a check button.

1. `AppUpdater.getInfo()` returns the installed `versionCode` from `PackageManager`.
2. `AppUpdater.fetchManifest()` reads `update.json` **natively** and the app compares `versionCode`
   numerically — never version strings. The WebView cannot fetch it: GitHub serves release assets
   with no `access-control-allow-origin` header, so a `fetch()` from the app origin dies in CORS
   preflight before reaching the network. Anything added here that talks to GitHub must go through
   the plugin for the same reason.
3. If newer, a **دانلود و نصب** button appears.
4. `canInstall()` checks `PackageManager.canRequestPackageInstalls()`. The first time this is false;
   the app opens `ACTION_MANAGE_UNKNOWN_APP_SOURCES` so the user grants it permission to install
   packages, then they press install again.
5. `downloadAndInstall()` streams the APK into `cacheDir/updates/`, emitting `downloadProgress`
   events (0..1) that drive the progress bar, then hands the file to the system installer through the
   existing `FileProvider` and `ACTION_VIEW`.

Both native requests share `AppUpdaterPlugin.open()`, which follows redirects manually:
`HttpURLConnection` will not follow one that changes protocol, and GitHub bounces release assets to
`release-assets.githubusercontent.com`.

There is no silent install and there cannot be one: Android always shows its own confirmation
dialog. The permission that enables this flow is `REQUEST_INSTALL_PACKAGES` in the manifest.

Relevant files:

- [`android/app/src/main/java/dev/njfamirm/taraz/AppUpdaterPlugin.java`](../android/app/src/main/java/dev/njfamirm/taraz/AppUpdaterPlugin.java)
- [`src/native/updater.ts`](../src/native/updater.ts) — plugin bindings and the manifest URL
- [`src/components/UpdateCard.tsx`](../src/components/UpdateCard.tsx) — the Settings UI

---

## Troubleshooting

| Problem                                             | Cause and fix                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "App not installed" during an in-app update         | The installed build was signed with a different key. Uninstall first; this only happens once.   |
| The check button reports an HTTP 404                | No tagged release exists yet, so `releases/latest` resolves to nothing. Push a `v*` tag.        |
| The install button does nothing                     | "Install unknown apps" was not granted. The app opens the settings screen; enable it and retry. |
| A native plugin method fails only in release builds | R8 stripped or renamed it. Add a keep rule to `proguard-rules.pro`.                             |
| Play Protect still warns on first install           | Expected for any sideloaded APK. Choose "install anyway"; the debug-specific warning is gone.   |
