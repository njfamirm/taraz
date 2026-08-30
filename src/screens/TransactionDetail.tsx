import { useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Transaction } from "../db/types.ts";
import {
  deleteTransaction,
  getSplit,
  listPeople,
  listProjects,
  listTags,
  updateTransaction,
} from "../db/repo.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliDate, formatJalaliTime } from "../lib/date.ts";
import { realExpense } from "../lib/split.ts";
import { SplitEditor } from "../components/SplitEditor.tsx";

export function TransactionDetail({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);
  const people = useLiveQuery(listPeople, [], []);
  const split = useLiveQuery(() => getSplit(tx.id), [tx.id]);

  const [editingSplit, setEditingSplit] = useState(false);
  const [note, setNote] = useState(tx.note ?? "");

  const mine = realExpense(tx, split);

  function toggleTag(tagId: string) {
    const next = tx.tagIds.includes(tagId)
      ? tx.tagIds.filter((id) => id !== tagId)
      : [...tx.tagIds, tagId];
    void updateTransaction(tx.id, { tagIds: next });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <button type="button" onClick={onClose} className="p-1" aria-label="بازگشت">
          <ArrowRight size={20} />
        </button>
        <button
          type="button"
          onClick={async () => {
            await deleteTransaction(tx.id);
            onClose();
          }}
          className="p-1 text-neutral-400"
          aria-label="حذف تراکنش"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="text-center">
          <div
            className={`text-3xl font-bold tabular-nums ${
              tx.direction === "in" ? "text-emerald-600" : ""
            }`}
          >
            {tx.direction === "in" ? "+" : "‑"}
            {formatToman(tx.amount, { unit: true })}
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            {tx.counterparty ?? "بدون عنوان"} · {formatJalaliDate(tx.occurredAt)}{" "}
            {formatJalaliTime(tx.occurredAt)}
          </div>
          {split && (
            <div className="mt-1 text-xs text-neutral-500">
              سهم واقعی شما: {formatToman(mine, { unit: true })}
            </div>
          )}
        </div>

        <Section title="پروژه">
          <div className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <Chip
                key={project.id}
                active={tx.projectId === project.id}
                color={project.color}
                onClick={() =>
                  updateTransaction(tx.id, {
                    projectId: tx.projectId === project.id ? null : project.id,
                  })
                }
              >
                {project.title}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="برچسب‌ها">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                active={tx.tagIds.includes(tag.id)}
                color={tag.color}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.title}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="تقسیم و طلب">
          {editingSplit ? (
            <SplitEditor
              tx={tx}
              split={split}
              people={people}
              onClose={() => setEditingSplit(false)}
            />
          ) : split ? (
            <button
              type="button"
              onClick={() => setEditingSplit(true)}
              className="w-full rounded-xl bg-neutral-50 p-3 text-right text-sm dark:bg-neutral-800/60"
            >
              <ul className="space-y-1">
                {split.shares.map((share, index) => (
                  <li key={index} className="flex justify-between">
                    <span>
                      {share.personId === null
                        ? "خودم"
                        : (people.find((p) => p.id === share.personId)?.name ?? "؟")}
                      {share.settledAt !== null && " · تسویه شد"}
                    </span>
                    <span className="tabular-nums text-neutral-500">
                      {formatToman(share.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingSplit(true)}
              className="w-full rounded-xl bg-neutral-50 py-3 text-sm dark:bg-neutral-800/60"
            >
              افزودن تقسیم
            </button>
          )}
        </Section>

        <Section title="یادداشت">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => updateTransaction(tx.id, { note: note.trim() || null })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </Section>

        {tx.rawText && (
          <Section title="متن پیامک">
            <p className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs leading-6 text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
              {tx.rawText}
            </p>
            <p className="mt-1 text-[11px] text-neutral-400">
              فرستنده: {tx.rawSender ?? "—"} · اطمینان تحلیل: {Math.round(tx.parseConfidence * 100)}
              ٪
            </p>
          </Section>
        )}

        <div className="grid grid-cols-2 gap-2 pb-4">
          <button
            type="button"
            onClick={async () => {
              await updateTransaction(tx.id, { status: "categorized" });
              onClose();
            }}
            className="rounded-lg bg-[var(--color-brand)] py-2.5 text-sm font-bold text-white"
          >
            تأیید و بستن
          </button>
          <button
            type="button"
            onClick={async () => {
              await updateTransaction(tx.id, { status: "ignored" });
              onClose();
            }}
            className="rounded-lg bg-neutral-100 py-2.5 text-sm dark:bg-neutral-800"
          >
            نادیده بگیر
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { backgroundColor: color, color: "white" } : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        active ? "" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}
