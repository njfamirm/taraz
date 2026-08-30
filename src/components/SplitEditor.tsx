import { useMemo, useState } from "react";
import type { Person, Share, Split, SplitMode, Transaction } from "../db/types.ts";
import { computeShares, validateSplit, type ShareInput } from "../lib/split.ts";
import { formatToman, parseTomanInput } from "../lib/money.ts";
import { setSplit } from "../db/repo.ts";

const MODE_LABELS: Record<SplitMode, string> = {
  "full-claim": "کامل به عهده‌ی دیگری",
  equal: "دنگی",
  percent: "درصدی",
  exact: "مبلغ دقیق",
};

/** Editing state: which people take part, and their percent/exact value. */
interface Row {
  personId: string | null;
  value: string;
}

export function SplitEditor({
  tx,
  split,
  people,
  onClose,
}: {
  tx: Transaction;
  split: Split | undefined;
  people: Person[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<SplitMode>(split?.mode ?? "equal");
  const [rows, setRows] = useState<Row[]>(() => initialRows(split, mode));
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo<ShareInput[]>(
    () =>
      rows.map((row) => ({
        personId: row.personId,
        value:
          mode === "exact"
            ? (parseTomanInput(row.value) ?? 0)
            : Number(row.value.replace(/[^\d.]/g, "")) || 0,
      })),
    [rows, mode],
  );

  const preview = useMemo<Share[]>(() => {
    try {
      return computeShares(mode, tx.amount, participants);
    } catch {
      return [];
    }
  }, [mode, tx.amount, participants]);

  function toggle(personId: string | null) {
    setRows((current) =>
      current.some((row) => row.personId === personId)
        ? current.filter((row) => row.personId !== personId)
        : [...current, { personId, value: "" }],
    );
  }

  async function save() {
    const problem = validateSplit(mode, tx.amount, participants);
    if (problem) {
      setError(problem);
      return;
    }
    await setSplit(tx.id, { mode, shares: computeShares(mode, tx.amount, participants) });
    onClose();
  }

  const selectable: { id: string | null; name: string }[] = [
    ...(mode === "full-claim" ? [] : [{ id: null, name: "خودم" }]),
    ...people.map((p) => ({ id: p.id, name: p.name })),
  ];

  return (
    <div className="space-y-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(MODE_LABELS) as SplitMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setRows((current) =>
                key === "full-claim" ? current.filter((r) => r.personId !== null) : current,
              );
              setError(null);
            }}
            className={`rounded-lg py-2 text-xs font-bold ${
              mode === key
                ? "bg-[var(--color-brand)] text-white"
                : "bg-white text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>

      {people.length === 0 && (
        <p className="text-xs text-neutral-500">
          هنوز شخصی تعریف نشده — از تنظیمات یک نفر اضافه کنید.
        </p>
      )}

      <ul className="space-y-1">
        {selectable.map((person) => {
          const row = rows.find((r) => r.personId === person.id);
          const share = preview.find((s) => s.personId === person.id);
          return (
            <li key={person.id ?? "me"} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(person.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-right text-sm ${
                  row
                    ? "bg-[var(--color-brand)]/10 font-bold"
                    : "bg-white text-neutral-500 dark:bg-neutral-900"
                }`}
              >
                {person.name}
                {share && (
                  <span className="float-left text-xs tabular-nums text-neutral-500">
                    {formatToman(share.amount)}
                  </span>
                )}
              </button>
              {row && (mode === "percent" || mode === "exact") && (
                <input
                  value={row.value}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((r) =>
                        r.personId === person.id ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder={mode === "percent" ? "٪" : "تومان"}
                  className="w-24 rounded-lg border border-neutral-300 px-2 py-2 text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-neutral-500">
        مبلغ تراکنش: {formatToman(tx.amount, { unit: true })} · سهم شما:{" "}
        {formatToman(preview.find((s) => s.personId === null)?.amount ?? 0, { unit: true })}
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          className="flex-1 rounded-lg bg-[var(--color-brand)] py-2 text-sm font-bold text-white"
        >
          ذخیره‌ی تقسیم
        </button>
        {split && (
          <button
            type="button"
            onClick={async () => {
              await setSplit(tx.id, null);
              onClose();
            }}
            className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-neutral-900"
          >
            حذف
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-neutral-900"
        >
          انصراف
        </button>
      </div>
    </div>
  );
}

function initialRows(split: Split | undefined, mode: SplitMode): Row[] {
  if (!split) return mode === "full-claim" ? [] : [{ personId: null, value: "" }];
  return split.shares.map((share) => ({
    personId: share.personId,
    value: String(Math.round(share.amount / 10)),
  }));
}
