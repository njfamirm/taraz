import type { Transaction } from "../db/types.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliTime, formatRelativeDay } from "../lib/date.ts";

export function TransactionRow({
  tx,
  onClick,
}: {
  tx: Transaction;
  onClick?: (tx: Transaction) => void;
}) {
  const isIn = tx.direction === "in";
  return (
    <button
      type="button"
      onClick={() => onClick?.(tx)}
      className="flex w-full items-center justify-between border-b border-neutral-100 px-4 py-3 text-right dark:border-neutral-800"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{tx.counterparty ?? "بدون عنوان"}</div>
        <div className="text-xs text-neutral-500">
          {formatRelativeDay(tx.occurredAt)} · {formatJalaliTime(tx.occurredAt)}
          {tx.status === "pending" && " · در انتظار"}
        </div>
      </div>
      <div
        className={`shrink-0 text-sm font-bold tabular-nums ${
          isIn ? "text-emerald-600" : "text-neutral-800 dark:text-neutral-200"
        }`}
      >
        {isIn ? "+" : "‑"}
        {formatToman(tx.amount)}
      </div>
    </button>
  );
}
