import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload } from "lucide-react";
import { getSetting, setSetting } from "../db/repo.ts";
import {
  backupFilename,
  exportBackup,
  parseBackup,
  restoreBackup,
  type RestoreMode,
} from "../lib/backup.ts";
import { copyText, downloadText } from "../lib/clipboard.ts";
import { formatRelativeDay } from "../lib/date.ts";
import { toPersianDigits } from "../lib/money.ts";

const LAST_BACKUP_KEY = "lastBackupAt";
const NUDGE_AFTER_MS = 30 * 86_400_000;

/**
 * PRD 4.7. The device is the only copy, so this screen is blunt about it: it
 * says when the last backup happened and starts nagging after a month.
 */
export function BackupCard() {
  const lastBackupAt = useLiveQuery(() => getSetting<number>(LAST_BACKUP_KEY), [], undefined);
  const [now] = useState(() => Date.now());
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [status, setStatus] = useState<string | null>(null);

  const stale = lastBackupAt === undefined || now - lastBackupAt > NUDGE_AFTER_MS;

  async function save() {
    const backup = await exportBackup();
    const text = JSON.stringify(backup);
    const name = backupFilename(backup.exportedAt);
    // Some Android WebViews swallow a download; the clipboard is the fallback so
    // the data is never trapped on the device.
    if (downloadText(name, text)) setStatus(`${name} ذخیره شد`);
    else setStatus((await copyText(text)) ? "دانلود ممکن نبود؛ متن پشتیبان کپی شد" : "ذخیره نشد");
    await setSetting(LAST_BACKUP_KEY, backup.exportedAt);
  }

  async function restore(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const summary = await restoreBackup(backup, mode);
      setStatus(`${toPersianDigits(String(summary.rows))} ردیف بازگردانی شد`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "بازگردانی نشد");
    }
  }

  return (
    <div className="space-y-2">
      <p
        className={`text-xs ${stale ? "text-[var(--color-danger)]" : "text-[var(--color-ink-soft)]"}`}
      >
        {lastBackupAt === undefined
          ? "هنوز پشتیبان نگرفته‌اید. تنها نسخه‌ی داده‌ها روی همین گوشی است."
          : `آخرین پشتیبان: ${formatRelativeDay(lastBackupAt)}${stale ? " — وقتش رسیده" : ""}`}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="tap flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] py-3 text-sm font-bold text-white"
        >
          <Download size={16} /> گرفتن پشتیبان
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="tap flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] py-3 text-sm"
        >
          <Upload size={16} /> بازگردانی
        </button>
      </div>

      <div className="flex gap-1 rounded-lg bg-[var(--color-surface)] p-1 text-xs">
        {(
          [
            ["merge", "ادغام بر اساس شناسه"],
            ["replace", "جایگزینی کامل"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`tap flex-1 rounded-md py-2 ${
              mode === key ? "bg-[var(--color-brand)] font-bold text-white" : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void restore(file);
        }}
      />

      {status && <p className="text-xs text-[var(--color-ink-soft)]">{status}</p>}
    </div>
  );
}
