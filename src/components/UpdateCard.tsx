import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  AppUpdater,
  fetchManifest,
  readChannel,
  updaterAvailable,
  writeChannel,
  type InstalledInfo,
  type UpdateChannel,
  type UpdateManifest,
} from "../native/updater.ts";

const CHANNELS: { id: UpdateChannel; label: string; hint: string }[] = [
  { id: "nightly", label: "شبانه", hint: "هر تغییر روی main — ممکن است ناپایدار باشد" },
  { id: "stable", label: "پایدار", hint: "فقط نسخه‌های تگ‌خورده" },
];

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; manifest: UpdateManifest }
  | { kind: "downloading"; progress: number }
  | { kind: "installing" }
  | { kind: "error"; message: string };

export function UpdateCard() {
  const [installed, setInstalled] = useState<InstalledInfo | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [channel, setChannel] = useState<UpdateChannel>(readChannel);

  useEffect(() => {
    if (!updaterAvailable) return;
    AppUpdater.getInfo()
      .then(setInstalled)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!updaterAvailable) return;
    const handle = AppUpdater.addListener("downloadProgress", ({ progress }) => {
      setState((current) =>
        current.kind === "downloading" || current.kind === "available"
          ? { kind: "downloading", progress }
          : current,
      );
    });
    return () => {
      handle.then((listener) => listener.remove()).catch(() => {});
    };
  }, []);

  if (!updaterAvailable) {
    return <p className="text-xs text-neutral-500">به‌روزرسانی فقط در نسخه‌ی اندروید کار می‌کند.</p>;
  }

  async function check() {
    setState({ kind: "checking" });
    try {
      const manifest = await fetchManifest(channel);
      const current = installed ?? (await AppUpdater.getInfo());
      setInstalled(current);
      setState(
        manifest.versionCode > current.versionCode
          ? { kind: "available", manifest }
          : { kind: "current" },
      );
    } catch (error) {
      setState({ kind: "error", message: describe(error) });
    }
  }

  async function install(manifest: UpdateManifest) {
    setState({ kind: "downloading", progress: 0 });
    try {
      // Android needs a one-off "install unknown apps" grant per app.
      const { granted } = await AppUpdater.canInstall();
      if (!granted) {
        await AppUpdater.openInstallSettings();
        setState({
          kind: "error",
          message: "اجازه‌ی نصب را روشن کنید و دوباره «نصب» را بزنید.",
        });
        return;
      }
      await AppUpdater.downloadAndInstall({ url: manifest.apkUrl });
      setState({ kind: "installing" });
    } catch (error) {
      setState({ kind: "error", message: describe(error) });
    }
  }

  function selectChannel(next: UpdateChannel) {
    setChannel(next);
    writeChannel(next);
    setState({ kind: "idle" });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {CHANNELS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => selectChannel(option.id)}
            title={option.hint}
            className={
              option.id === channel
                ? "rounded-full bg-[var(--color-brand)] px-3 py-1 text-xs font-bold text-white"
                : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-bold dark:border-neutral-700"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        {CHANNELS.find((option) => option.id === channel)?.hint}
      </p>

      <p className="text-xs text-neutral-500">
        نسخه‌ی نصب‌شده: {installed ? `${installed.versionName} (${installed.versionCode})` : "…"}
      </p>

      {state.kind === "available" ? (
        <>
          <p className="text-sm font-bold">نسخه‌ی {state.manifest.versionName} آماده است</p>
          {state.manifest.notes ? (
            <p className="text-xs whitespace-pre-line text-neutral-500">{state.manifest.notes}</p>
          ) : null}
          <button
            type="button"
            onClick={() => install(state.manifest)}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-bold text-white"
          >
            <Download size={16} />
            دانلود و نصب
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={check}
          disabled={state.kind === "checking" || state.kind === "downloading"}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-bold disabled:opacity-50 dark:border-neutral-700"
        >
          <RefreshCw size={16} className={state.kind === "checking" ? "animate-spin" : undefined} />
          بررسی به‌روزرسانی
        </button>
      )}

      {state.kind === "downloading" ? (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full bg-[var(--color-brand)] transition-[width]"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            در حال دانلود… {Math.round(state.progress * 100)}٪
          </p>
        </div>
      ) : null}

      {state.kind === "installing" ? (
        <p className="text-xs text-neutral-500">
          نصب‌کننده‌ی اندروید باز شد؛ ادامه را آنجا تأیید کنید.
        </p>
      ) : null}
      {state.kind === "current" ? (
        <p className="text-xs text-neutral-500">به‌روزترین نسخه را دارید.</p>
      ) : null}
      {state.kind === "error" ? <p className="text-xs text-red-500">{state.message}</p> : null}
    </div>
  );
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // A 404 means the channel has no release yet, which is the one failure with
  // an answer the user can act on.
  if (message.includes("HTTP 404")) {
    return "روی این کانال هنوز نسخه‌ای منتشر نشده است.";
  }
  return `به‌روزرسانی انجام نشد — ${message}`;
}
