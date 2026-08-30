import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, EyeOff, Undo2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Transaction } from "../db/types.ts";
import { listProjects, listTags, updateTransaction } from "../db/repo.ts";
import { formatToman } from "../lib/money.ts";
import { formatJalaliTime, formatRelativeDay } from "../lib/date.ts";

interface Undoable {
  id: string;
  label: string;
  before: Pick<Transaction, "status" | "projectId" | "tagIds">;
}

/**
 * The daily job: empty the pending queue. It is built for speed above all —
 * one card at a time, every action a single thumb-sized tap, and the next
 * transaction already in place. Nothing here opens a screen.
 */
export function Inbox({
  pending,
  onOpen,
}: {
  pending: Transaction[];
  onOpen: (id: string) => void;
}) {
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);
  const [undoable, setUndoable] = useState<Undoable | null>(null);

  // The undo offer follows the last action, not the clock's start.
  useEffect(() => {
    if (!undoable) return;
    const timer = setTimeout(() => setUndoable(null), 5000);
    return () => clearTimeout(timer);
  }, [undoable]);

  const tx = pending[0];

  async function file(patch: Partial<Transaction>, label: string) {
    if (!tx) return;
    setUndoable({
      id: tx.id,
      label,
      before: { status: tx.status, projectId: tx.projectId, tagIds: tx.tagIds },
    });
    await updateTransaction(tx.id, patch);
  }

  async function undo() {
    if (!undoable) return;
    await updateTransaction(undoable.id, undoable.before);
    setUndoable(null);
  }

  if (!tx) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle2 size={44} className="text-[var(--color-positive)]" />
        <p className="text-lg font-bold">صندوق خالی است</p>
        <p className="text-sm text-[var(--color-ink-soft)]">همه‌چیز دسته‌بندی شده.</p>
        {undoable && <UndoButton label={undoable.label} onUndo={undo} />}
      </div>
    );
  }

  const isIn = tx.direction === "in";
  const unreadable = tx.parseConfidence === 0 && tx.source === "sms";

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1 text-xs text-[var(--color-ink-soft)]">
        <span className="num">{pending.length} تراکنش در انتظار</span>
        {undoable && <UndoButton label={undoable.label} onUndo={undo} />}
      </div>

      {/* What is coming, so the queue has a visible end. Deliberately not
          tappable: this area sits where the thumb misses. */}
      <ul className="space-y-1 px-1">
        {pending.slice(1, 4).map((next) => (
          <li
            key={next.id}
            className="flex items-center justify-between text-xs text-[var(--color-ink-faint)]"
          >
            <span>{formatRelativeDay(next.occurredAt)}</span>
            <span className="num" dir="ltr">
              {next.parseConfidence === 0 && next.source === "sms" ? (
                "خوانده نشد"
              ) : (
                <>
                  {next.direction === "in" ? "+" : "‑"}
                  {formatToman(next.amount)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Content is pushed to the bottom half: the chips are what gets tapped
          dozens of times, so they belong under the thumb, not under the eye. */}
      <div key={tx.id} className="flex flex-1 flex-col justify-end gap-4">
        <div className="card p-5">
          <div className="text-center">
            {unreadable ? (
              <p className="text-xl font-bold text-[var(--color-attention)]">پیامک خوانده نشد</p>
            ) : (
              <p
                className={`num text-4xl font-bold ${isIn ? "text-[var(--color-positive)]" : ""}`}
                dir="ltr"
              >
                {isIn ? "+" : "‑"}
                {formatToman(tx.amount)}
                <span className="ms-2 text-base font-normal text-[var(--color-ink-faint)]">
                  تومان
                </span>
              </p>
            )}
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {isIn ? "واریز" : "برداشت"} · {formatRelativeDay(tx.occurredAt)}{" "}
              {formatJalaliTime(tx.occurredAt)}
            </p>
          </div>

          {tx.rawText && (
            <p className="mt-4 line-clamp-3 rounded-xl bg-[var(--color-raised)] p-3 text-xs leading-6 text-[var(--color-ink-soft)]">
              {tx.rawText}
            </p>
          )}
        </div>

        {/* Nothing to categorize until there is an amount, so an unreadable
            message offers the one action that helps: fix it by hand. */}
        {unreadable ? (
          <button
            type="button"
            onClick={() => onOpen(tx.id)}
            className="tap w-full rounded-[var(--radius-chip)] bg-[var(--color-brand)] py-3 font-bold text-white"
          >
            اصلاح و ثبت دستی
          </button>
        ) : (
          <>
            <Rail title="پروژه">
              {projects
                .filter((project) => !project.archived)
                .map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() =>
                      file({ projectId: project.id, status: "categorized" }, project.title)
                    }
                    className="chip tap chip-brand"
                  >
                    {project.title}
                  </button>
                ))}
            </Rail>

            <Rail title="برچسب">
              {tags
                .filter((tag) => !tag.archived)
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => file({ tagIds: [tag.id], status: "categorized" }, tag.title)}
                    className="chip tap"
                  >
                    <span className="size-2 rounded-full" style={{ background: tag.color }} />
                    {tag.title}
                  </button>
                ))}
            </Rail>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => file({ status: "ignored" }, "نادیده")}
          className="chip tap justify-center"
        >
          <EyeOff size={16} /> نادیده
        </button>
        <button
          type="button"
          onClick={() => onOpen(tx.id)}
          className="chip tap justify-center"
          aria-label="جزئیات و دُنگ"
        >
          <ChevronLeft size={16} /> جزئیات و دُنگ
        </button>
      </div>
    </div>
  );
}

function Rail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-xs font-bold text-[var(--color-ink-faint)]">{title}</p>
      <div className="chip-rail">{children}</div>
    </div>
  );
}

function UndoButton({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      className="chip tap !min-h-8 !py-0 text-[var(--color-brand)]"
    >
      <Undo2 size={14} /> برگردان «{label}»
    </button>
  );
}
