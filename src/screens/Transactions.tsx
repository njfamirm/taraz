import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db.ts";
import { makeLabeler } from "../lib/labels.ts";
import type { Transaction } from "../db/types.ts";
import { TransactionRow } from "../components/TransactionRow.tsx";

export function Transactions({
  transactions,
  onOpen,
}: {
  transactions: Transaction[];
  onOpen: (id: string) => void;
}) {
  const refs = useLiveQuery(
    async () => ({
      projects: await db.projects.toArray(),
      tags: await db.tags.toArray(),
      accounts: await db.accounts.toArray(),
    }),
    [],
  );
  const labels = refs && makeLabeler(refs);

  if (transactions.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-[var(--color-ink-soft)]">هنوز تراکنشی ثبت نشده.</p>
    );
  }
  // Deleting lives in the detail sheet: a delete control beside every row is one
  // mis-tap away from losing a transaction while scrolling.
  return (
    <ul>
      {transactions.map((tx) => (
        <li key={tx.id}>
          <TransactionRow tx={tx} labels={labels} onClick={(clicked) => onOpen(clicked.id)} />
        </li>
      ))}
    </ul>
  );
}
