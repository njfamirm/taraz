import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ClipboardCopy } from "lucide-react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns-jalali";
import type { Transaction } from "../db/types.ts";
import { listPeople, listProjects, listSplits, listTags } from "../db/repo.ts";
import { buildReport, renderJson, renderMarkdown } from "../lib/report.ts";
import { copyText } from "../lib/clipboard.ts";
import { toPersianDigits } from "../lib/money.ts";
import { formatJalaliDate, formatJalaliMonth, toDateTimeLocal } from "../lib/date.ts";

type PeriodKey = "this" | "last" | "custom";

/** PRD 4.6: one button, a period, and a block of text you paste into a chat. */
export function Export({ transactions }: { transactions: Transaction[] }) {
  const splits = useLiveQuery(listSplits, [], []);
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);
  const people = useLiveQuery(listPeople, [], []);

  // Pinned once per mount: the export must not shift under the user mid-tap.
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState<PeriodKey>("this");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateTimeLocal(startOfMonth(Date.now()).getTime()).slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(() => toDateTimeLocal(Date.now()).slice(0, 10));
  const [copied, setCopied] = useState<"md" | "json" | null>(null);

  const range = useMemo(() => {
    if (period === "this")
      return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() + 1 };
    if (period === "last") {
      const prev = addMonths(now, -1);
      return { from: startOfMonth(prev).getTime(), to: endOfMonth(prev).getTime() + 1 };
    }
    const from = new Date(`${customFrom}T00:00`).getTime();
    const to = new Date(`${customTo}T00:00`).getTime() + 86_400_000;
    return { from: Number.isNaN(from) ? 0 : from, to: Number.isNaN(to) ? now : to };
  }, [now, period, customFrom, customTo]);

  const report = useMemo(
    () => buildReport({ transactions, splits, projects, tags, people, ...range }),
    [transactions, splits, projects, tags, people, range],
  );

  async function copy(kind: "md" | "json") {
    const text = kind === "md" ? renderMarkdown(report) : renderJson(report);
    if (await copyText(text)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-[var(--color-ink-soft)]">خروجی برای هوش مصنوعی</h3>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--color-surface)] p-1">
        {(
          [
            ["this", formatJalaliMonth(now)],
            ["last", "ماه قبل"],
            ["custom", "بازه‌ی دلخواه"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`tap rounded-md py-2 text-xs ${
              period === key ? "bg-[var(--color-brand)] font-bold text-white" : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-2 text-xs"
          />
          <span className="text-xs text-[var(--color-ink-faint)]">تا</span>
          <input
            type="date"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-2 text-xs"
          />
        </div>
      )}

      <p className="num text-xs text-[var(--color-ink-faint)]">
        {formatJalaliDate(range.from)} تا {formatJalaliDate(range.to - 1)} —{" "}
        {toPersianDigits(String(report.quality.transactions))} تراکنش
        {report.quality.pending > 0 &&
          `، ${toPersianDigits(String(report.quality.pending))} دسته‌بندی‌نشده`}
      </p>

      <div className="flex gap-2">
        <CopyButton label="متن مارک‌داون" done={copied === "md"} onClick={() => void copy("md")} />
        <CopyButton label="JSON فشرده" done={copied === "json"} onClick={() => void copy("json")} />
      </div>

      <p className="text-xs text-[var(--color-ink-faint)]">
        متن پیامک‌های خام، شماره کارت و شناسه‌ی حساب در خروجی نیست.
      </p>
    </section>
  );
}

function CopyButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] py-3 text-sm font-bold"
    >
      {done ? (
        <Check size={16} className="text-[var(--color-positive)]" />
      ) : (
        <ClipboardCopy size={16} />
      )}
      {done ? "کپی شد" : label}
    </button>
  );
}
