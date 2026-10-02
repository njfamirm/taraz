import type { Transaction } from "../db/types.ts";
import type { Labeler } from "../lib/labels.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliTime, formatRelativeDay } from "../lib/date.ts";

export function TransactionRow({
  tx,
  onClick,
  labels,
}: {
  tx: Transaction;
  onClick?: (tx: Transaction) => void;
  labels?: Labeler;
}) {
  const chips = labels?.(tx) ?? [];
  const isIn = tx.direction === "in";
  // Captured but unreadable: kept so the raw text is not lost (PRD 4.1).
  const unreadable = tx.parseConfidence === 0 && tx.source === "sms";
  return (
    <button
      type="button"
      onClick={() => onClick?.(tx)}
      className="tap flex w-full items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-right"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">
          {tx.counterparty ?? (unreadable ? "پیامک خوانده نشد" : "بدون عنوان")}
        </div>
        <div className="text-xs text-[var(--color-ink-soft)]">
          {formatRelativeDay(tx.occurredAt)} · {formatJalaliTime(tx.occurredAt)}
          {tx.status === "pending" && " · در انتظار"}
        </div>
        {chips.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <li
                key={chip.key}
                style={{ borderColor: chip.color }}
                className="rounded-full border px-2 text-[11px]"
              >
                <span className="text-[var(--color-ink-soft)]">{chip.kind}: </span>
                {chip.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      {unreadable ? (
        <div className="shrink-0 text-xs font-bold text-[var(--color-attention)]">
          نیاز به بررسی
        </div>
      ) : (
        <div
          className={`num shrink-0 text-sm font-bold ${isIn ? "text-[var(--color-positive)]" : ""}`}
        >
          {isIn ? "+" : "‑"}
          {formatToman(tx.amount)}
        </div>
      )}
    </button>
  );
}
