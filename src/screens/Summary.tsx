import { useState } from "react";
import type { Transaction } from "../db/types.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliMonth } from "../lib/date.ts";

export function Summary({ transactions }: { transactions: Transaction[] }) {
  const [now] = useState(() => Date.now());
  const income = transactions
    .filter((t) => t.direction === "in" && t.status !== "ignored")
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => t.direction === "out" && t.status !== "ignored")
    .reduce((sum, t) => sum + t.amount, 0);

  const rows = [
    { label: "درآمد", value: income },
    { label: "هزینه", value: expense },
    { label: "خالص", value: income - expense },
  ];

  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm text-neutral-500">{formatJalaliMonth(now)}</h2>
      <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between py-3">
            <dt className="text-sm text-neutral-500">{row.label}</dt>
            <dd className="font-bold tabular-nums">{formatToman(row.value, { unit: true })}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-xs text-neutral-400">
        نمودارها کار مدل زبانی است — این صفحه فقط عدد می‌دهد.
      </p>
    </div>
  );
}
