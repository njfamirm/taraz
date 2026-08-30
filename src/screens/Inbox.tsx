import { CheckCircle2 } from "lucide-react";
import type { Transaction } from "../db/types.ts";
import { TransactionRow } from "../components/TransactionRow.tsx";
import { updateTransaction } from "../db/repo.ts";

export function Inbox({
  pending,
  onOpen,
}: {
  pending: Transaction[];
  onOpen: (id: string) => void;
}) {
  if (pending.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <CheckCircle2 size={40} className="text-emerald-500" />
        <p className="font-bold">صندوق خالی است</p>
        <p className="text-sm text-neutral-500">همه‌ی تراکنش‌ها دسته‌بندی شده‌اند.</p>
      </div>
    );
  }

  return (
    <ul>
      {pending.map((tx) => (
        <li key={tx.id}>
          <TransactionRow tx={tx} onClick={(clicked) => onOpen(clicked.id)} />
          <div className="flex gap-2 px-4 pb-3">
            <button
              type="button"
              onClick={() => updateTransaction(tx.id, { status: "categorized" })}
              className="rounded-md bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800"
            >
              دسته‌بندی شد
            </button>
            <button
              type="button"
              onClick={() => updateTransaction(tx.id, { status: "ignored" })}
              className="rounded-md bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800"
            >
              نادیده
            </button>
            <button
              type="button"
              onClick={() => onOpen(tx.id)}
              className="rounded-md bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800"
            >
              جزئیات
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
