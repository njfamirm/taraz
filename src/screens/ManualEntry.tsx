import { useState } from "react";
import { createTransaction } from "../db/repo.ts";
import type { Direction } from "../db/types.ts";
import { parseTomanInput } from "../lib/money.ts";
import { toDateTimeLocal } from "../lib/date.ts";

export function ManualEntry({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("out");
  const [counterparty, setCounterparty] = useState("");
  const [when, setWhen] = useState(() => toDateTimeLocal(Date.now()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const rial = parseTomanInput(amount);
    if (rial === null || rial <= 0) {
      setError("مبلغ معتبر نیست");
      return;
    }
    await createTransaction({
      amount: rial,
      direction,
      occurredAt: new Date(when).getTime(),
      counterparty: counterparty.trim() || null,
      note: note.trim() || null,
      source: "manual",
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2">
        {(["out", "in"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => setDirection(dir)}
            className={`rounded-lg py-2 text-sm font-bold ${
              direction === dir
                ? "bg-[var(--color-brand)] text-white"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {dir === "out" ? "برداشت" : "واریز"}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-xs text-neutral-500">مبلغ (تومان)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          autoFocus
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-lg tabular-nums dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-500">طرف حساب</span>
        <input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-500">زمان</span>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-500">یادداشت</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-[var(--color-brand)] py-2.5 font-bold text-white"
        >
          ثبت
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-neutral-100 px-4 py-2.5 dark:bg-neutral-800"
        >
          انصراف
        </button>
      </div>
    </form>
  );
}
