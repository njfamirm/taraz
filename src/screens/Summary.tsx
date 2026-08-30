import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Transaction } from "../db/types.ts";
import { listProjects, listSplits, listTags } from "../db/repo.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliMonth } from "../lib/date.ts";
import { realExpense, totalOpenClaims } from "../lib/split.ts";

/** Deliberately thin: numbers only. Charts are the LLM's job (PRD 4.5). */
export function Summary({ transactions }: { transactions: Transaction[] }) {
  const [now] = useState(() => Date.now());
  const splits = useLiveQuery(listSplits, [], []);
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);

  const splitByTx = useMemo(
    () => new Map(splits.map((split) => [split.transactionId, split])),
    [splits],
  );

  const active = transactions.filter((tx) => tx.status !== "ignored");
  const income = sum(active.filter((tx) => tx.direction === "in"));
  const outgoing = active.filter((tx) => tx.direction === "out");
  const expense = sum(outgoing);
  const real = outgoing.reduce((total, tx) => total + realExpense(tx, splitByTx.get(tx.id)), 0);

  const byProject = projects
    .map((project) => ({
      label: project.title,
      value: outgoing
        .filter((tx) => tx.projectId === project.id)
        .reduce((total, tx) => total + realExpense(tx, splitByTx.get(tx.id)), 0),
    }))
    .filter((row) => row.value > 0);

  const byTag = tags
    .map((tag) => ({
      label: tag.title,
      value: outgoing
        .filter((tx) => tx.tagIds.includes(tag.id))
        .reduce((total, tx) => total + realExpense(tx, splitByTx.get(tx.id)), 0),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-sm text-neutral-500">{formatJalaliMonth(now)}</h2>

      <Rows
        rows={[
          { label: "درآمد", value: income },
          { label: "هزینه‌ی ناخالص", value: expense },
          { label: "هزینه‌ی واقعی (بدون طلب‌ها)", value: real },
          { label: "خالص", value: income - real, signed: true },
          { label: "طلب باز", value: totalOpenClaims(splits) },
        ]}
      />

      {byProject.length > 0 && <Block title="به تفکیک پروژه" rows={byProject} />}
      {byTag.length > 0 && <Block title="به تفکیک برچسب" rows={byTag} />}

      <p className="text-xs text-neutral-400">
        نمودارها کار مدل زبانی است — این صفحه فقط عدد می‌دهد.
      </p>
    </div>
  );
}

function sum(list: Transaction[]): number {
  return list.reduce((total, tx) => total + tx.amount, 0);
}

function Block({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; signed?: boolean }[];
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-bold text-neutral-500">{title}</h3>
      <Rows rows={rows} />
    </section>
  );
}

function Rows({ rows }: { rows: { label: string; value: number; signed?: boolean }[] }) {
  return (
    <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between py-3">
          <dt className="text-sm text-neutral-500">{row.label}</dt>
          <dd className="font-bold tabular-nums">
            {formatToman(row.value, { unit: true, sign: row.signed })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
