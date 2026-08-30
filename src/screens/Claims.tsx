import { useLiveQuery } from "dexie-react-hooks";
import { HandCoins } from "lucide-react";
import {
  listPeople,
  listSplits,
  listTransactions,
  settleAllForPerson,
  settleShare,
} from "../db/repo.ts";
import { formatToman } from "../lib/money.ts";
import { formatRelativeDay } from "../lib/date.ts";
import { openClaims } from "../lib/split.ts";

export function Claims() {
  const people = useLiveQuery(listPeople, [], []);
  const splits = useLiveQuery(listSplits, [], []);
  const transactions = useLiveQuery(listTransactions, [], []);

  const byId = new Map(transactions.map((tx) => [tx.id, tx]));
  const owing = people
    .map((person) => ({ person, open: openClaims(splits, person.id) }))
    .filter((row) => row.open > 0)
    .sort((a, b) => b.open - a.open);

  if (owing.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <HandCoins size={40} className="text-neutral-300" />
        <p className="font-bold">طلب بازی نیست</p>
        <p className="text-sm text-neutral-500">هر چه پرداخت کرده‌اید تسویه شده است.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {owing.map(({ person, open }) => {
        const shares = splits.flatMap((split) =>
          split.shares
            .map((share, index) => ({ split, share, index }))
            .filter((row) => row.share.personId === person.id && row.share.settledAt === null),
        );
        return (
          <section key={person.id} className="p-4">
            <header className="flex items-center justify-between">
              <div>
                <div className="font-bold">{person.name}</div>
                <div className="text-xs text-neutral-500">
                  {person.kind === "company" ? "شرکت" : "شخص"}
                </div>
              </div>
              <div className="text-left">
                <div className="font-bold tabular-nums text-[var(--color-brand)]">
                  {formatToman(open, { unit: true })}
                </div>
                <button
                  type="button"
                  onClick={() => settleAllForPerson(person.id)}
                  className="mt-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] dark:bg-neutral-800"
                >
                  تسویه‌ی کامل
                </button>
              </div>
            </header>

            <ul className="mt-3 space-y-1">
              {shares.map(({ split, share, index }) => {
                const tx = byId.get(split.transactionId);
                return (
                  <li key={`${split.id}-${index}`} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => settleShare(split.id, index, true)}
                      className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] dark:bg-neutral-800"
                    >
                      تسویه
                    </button>
                    <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
                      {tx?.counterparty ?? "بدون عنوان"}
                      {tx && ` · ${formatRelativeDay(tx.occurredAt)}`}
                    </span>
                    <span className="tabular-nums text-neutral-500">
                      {formatToman(share.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
