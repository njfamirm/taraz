import { X } from "lucide-react";
import type { Transaction } from "../db/types.ts";
import { TransactionRow } from "../components/TransactionRow.tsx";
import { deleteTransaction } from "../db/repo.ts";

export function Transactions({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="p-8 text-center text-sm text-neutral-500">هنوز تراکنشی ثبت نشده.</p>;
  }
  return (
    <ul>
      {transactions.map((tx) => (
        <li key={tx.id} className="flex items-center">
          <div className="flex-1">
            <TransactionRow tx={tx} />
          </div>
          <button
            type="button"
            onClick={() => deleteTransaction(tx.id)}
            className="px-3 text-neutral-400"
            aria-label="حذف"
          >
            <X size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
