import type { Transaction } from "../db/types.ts";
import { TransactionRow } from "../components/TransactionRow.tsx";

export function Transactions({
  transactions,
  onOpen,
}: {
  transactions: Transaction[];
  onOpen: (id: string) => void;
}) {
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
          <TransactionRow tx={tx} onClick={(clicked) => onOpen(clicked.id)} />
        </li>
      ))}
    </ul>
  );
}
