import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  AppUpdater,
  fetchManifest,
  installUpdate,
  readChannel,
  readDismissed,
  updaterAvailable,
  writeDismissed,
  type UpdateManifest,
} from "../native/updater.ts";

/**
 * Offers a newer build once per launch, shortly after startup. "Later" is
 * remembered per version, so a nightly user is not asked again until the next
 * build; the manual check in settings is unaffected.
 */
export function UpdateDialog() {
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [installedName, setInstalledName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!updaterAvailable) return;
    const timer = setTimeout(async () => {
      try {
        const info = await AppUpdater.getInfo();
        const latest = await fetchManifest(readChannel());
        if (latest.versionCode > info.versionCode && latest.versionCode > readDismissed()) {
          setInstalledName(info.versionName);
          setManifest(latest);
        }
      } catch {
        // Offline or no release yet: a background check stays silent.
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const handle = AppUpdater.addListener("downloadProgress", (event) =>
      setProgress(event.progress),
    );
    return () => void handle.then((listener) => listener.remove()).catch(() => {});
  }, [manifest]);

  if (!manifest) return null;
  const update = manifest;
  const downloading = progress !== null;

  function later() {
    writeDismissed(update.versionCode);
    setManifest(null);
  }

  async function install() {
    setError(null);
    setProgress(0);
    try {
      if ((await installUpdate(update)) === "needs-permission") {
        setProgress(null);
        setError("اجازه‌ی نصب را روشن کنید و دوباره «نصب» را بزنید.");
      }
    } catch (failure) {
      setProgress(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-xl">
        <div>
          <h2 className="text-base font-bold">نسخه‌ی جدید آماده است</h2>
          <p className="num mt-1 text-xs text-[var(--color-ink-faint)]">
            {installedName} ← {update.versionName}
          </p>
        </div>

        {update.notes ? (
          <p className="max-h-32 overflow-y-auto text-xs whitespace-pre-line text-[var(--color-ink-faint)]">
            {update.notes}
          </p>
        ) : null}

        {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}

        {downloading ? (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="h-full bg-[var(--color-brand)] transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="num mt-1 text-xs text-[var(--color-ink-faint)]">
              در حال دانلود… {Math.round(progress * 100)}٪
            </p>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={install}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-bold text-white"
            >
              <Download size={16} />
              دانلود و نصب
            </button>
            <button
              type="button"
              onClick={later}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-bold dark:border-neutral-700"
            >
              بعداً
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
