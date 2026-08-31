import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { db } from "../db/db.ts";
import type { CategoryRule, Condition, SplitMode, Transaction } from "../db/types.ts";
import {
  deleteCategoryRule,
  listCategoryRules,
  listPeople,
  listProjects,
  listTags,
  listTransactions,
  saveCategoryRule,
} from "../db/repo.ts";
import { matchesRule } from "../lib/rules.ts";
import { applyRulesToPending } from "../lib/categorize.ts";
import { formatToman, parseTomanInput, toPersianDigits } from "../lib/money.ts";

const KIND_LABELS: Record<Condition["kind"], string> = {
  amountBetween: "مبلغ بین",
  timeOfDay: "ساعت روز",
  dayOfWeek: "روز هفته",
  account: "حساب",
  direction: "جهت",
  textContains: "یادداشت شامل",
};

const WEEKDAYS = ["یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"];

function emptyRule(priority: number): CategoryRule {
  return {
    id: "",
    title: "",
    enabled: true,
    priority,
    conditions: [{ kind: "direction", direction: "out" }],
    actions: {},
  };
}

/**
 * PRD 4.4. Rules are pure data and the screen shows exactly what each one will
 * do, previewed against real history before it is saved. Nothing here learns.
 */
export function CategoryRules() {
  const rules = useLiveQuery(listCategoryRules, [], []);
  const transactions = useLiveQuery(listTransactions, [], []);
  const [editing, setEditing] = useState<CategoryRule | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  if (editing) {
    return (
      <RuleEditor
        rule={editing}
        transactions={transactions}
        onClose={() => setEditing(null)}
        onSave={async (rule) => {
          await saveCategoryRule(rule.id === "" ? { ...rule, id: undefined } : rule);
          setEditing(null);
        }}
        onDelete={
          editing.id === ""
            ? undefined
            : async () => {
                await deleteCategoryRule(editing.id);
                setEditing(null);
              }
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-ink-soft)]">
        قاعده‌ها هنگام دریافت پیامک اجرا می‌شوند و اولین قاعده‌ی جوردرآمده برنده است.
      </p>

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id}>
            <button
              type="button"
              onClick={() => setEditing(rule)}
              className="tap w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-right"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{rule.title}</span>
                <span className="num text-[11px] text-[var(--color-ink-faint)]">
                  {rule.enabled ? `اولویت ${toPersianDigits(String(rule.priority))}` : "غیرفعال"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {rule.conditions.map((c) => KIND_LABELS[c.kind]).join(" و ") || "بدون شرط"}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(emptyRule((rules.at(-1)?.priority ?? 0) + 10))}
          className="tap flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] py-3 text-sm font-bold text-white"
        >
          <Plus size={16} /> قاعده‌ی تازه
        </button>
        <button
          type="button"
          onClick={async () => setApplied(await applyRulesToPending())}
          className="tap flex-1 rounded-lg border border-[var(--color-line)] py-3 text-sm"
        >
          {applied === null
            ? "اجرا روی دسته‌بندی‌نشده‌ها"
            : `${toPersianDigits(String(applied))} تراکنش دسته‌بندی شد`}
        </button>
      </div>
    </div>
  );
}

function RuleEditor({
  rule: initial,
  transactions,
  onClose,
  onSave,
  onDelete,
}: {
  rule: CategoryRule;
  transactions: Transaction[];
  onClose: () => void;
  onSave: (rule: CategoryRule) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);
  const people = useLiveQuery(listPeople, [], []);
  const [rule, setRule] = useState(initial);

  // "Preview against history" (PRD 4.4): the rule is judged on real rows before
  // it is ever saved.
  const matches = useMemo(
    () => transactions.filter((tx) => matchesRule({ ...rule, enabled: true }, tx)),
    [rule, transactions],
  );

  function patch(next: Partial<CategoryRule>) {
    setRule((current) => ({ ...current, ...next }));
  }

  function patchCondition(index: number, next: Condition) {
    patch({ conditions: rule.conditions.map((c, i) => (i === index ? next : c)) });
  }

  return (
    <div className="space-y-4">
      <input
        value={rule.title}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder="نام قاعده، مثلاً «ناهار کاری»"
        className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />

      <section className="space-y-2">
        <h4 className="text-xs font-bold text-[var(--color-ink-soft)]">
          شرط‌ها (همه باید برقرار باشند)
        </h4>
        {rule.conditions.map((condition, index) => (
          <div
            key={index}
            className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
          >
            <div className="flex items-center gap-2">
              <select
                value={condition.kind}
                onChange={(event) =>
                  patchCondition(index, { kind: event.target.value as Condition["kind"] })
                }
                className="flex-1 bg-transparent text-sm font-bold"
              >
                {Object.entries(KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="حذف شرط"
                onClick={() => patch({ conditions: rule.conditions.filter((_, i) => i !== index) })}
                className="tap text-[var(--color-ink-faint)]"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <ConditionFields
              condition={condition}
              onChange={(next) => patchCondition(index, next)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({ conditions: [...rule.conditions, { kind: "amountBetween", min: 0 }] })
          }
          className="tap w-full rounded-lg border border-dashed border-[var(--color-line)] py-2 text-xs"
        >
          افزودن شرط
        </button>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold text-[var(--color-ink-soft)]">نتیجه</h4>
        <Field label="پروژه">
          <select
            value={rule.actions.projectId ?? ""}
            onChange={(event) =>
              patch({ actions: { ...rule.actions, projectId: event.target.value || undefined } })
            }
            className="bg-transparent text-sm"
          >
            <option value="">—</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = rule.actions.tagIds?.includes(tag.id) ?? false;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  patch({
                    actions: {
                      ...rule.actions,
                      tagIds: on
                        ? rule.actions.tagIds?.filter((id) => id !== tag.id)
                        : [...(rule.actions.tagIds ?? []), tag.id],
                    },
                  })
                }
                style={{ borderColor: tag.color, background: on ? tag.color : undefined }}
                className={`rounded-full border-2 px-3 py-1 text-xs ${on ? "font-bold text-white" : ""}`}
              >
                {tag.title}
              </button>
            );
          })}
        </div>

        <Field label="دنگ خودکار">
          <select
            value={rule.actions.splitMode ?? ""}
            onChange={(event) =>
              patch({
                actions: {
                  ...rule.actions,
                  splitMode: (event.target.value || undefined) as SplitMode | undefined,
                },
              })
            }
            className="bg-transparent text-sm"
          >
            <option value="">—</option>
            <option value="full-claim">کل مبلغ طلب از</option>
            <option value="equal">نصف‌نصف با</option>
          </select>
        </Field>
        {rule.actions.splitMode && (
          <Field label="طرف حساب">
            <select
              value={rule.actions.personId ?? ""}
              onChange={(event) =>
                patch({ actions: { ...rule.actions, personId: event.target.value || undefined } })
              }
              className="bg-transparent text-sm"
            >
              <option value="">—</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <input
          value={rule.actions.note ?? ""}
          onChange={(event) =>
            patch({ actions: { ...rule.actions, note: event.target.value || undefined } })
          }
          placeholder="یادداشت پیش‌فرض (یادداشت دست‌نویس بازنویسی نمی‌شود)"
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Field label="اولویت">
            <input
              type="number"
              value={rule.priority}
              onChange={(event) => patch({ priority: Number(event.target.value) })}
              className="num w-16 bg-transparent text-left text-sm"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            فعال
          </label>
        </div>

        <p className="num rounded-lg bg-[var(--color-surface)] p-3 text-xs text-[var(--color-ink-soft)]">
          {toPersianDigits(String(matches.length))} تراکنش از گذشته با این قاعده می‌خوانند
          {matches.length > 0 &&
            ` — بزرگ‌ترین ${formatToman(Math.max(...matches.map((tx) => tx.amount)), { unit: true })}`}
        </p>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={rule.title.trim() === "" || rule.conditions.length === 0}
          onClick={() => void onSave({ ...rule, title: rule.title.trim() })}
          className="tap flex-1 rounded-lg bg-[var(--color-brand)] py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          ذخیره
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap flex-1 rounded-lg border border-[var(--color-line)] py-3 text-sm"
        >
          انصراف
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label="حذف قاعده"
            onClick={() => void onDelete()}
            className="tap grid w-12 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-danger)]"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionFields({
  condition,
  onChange,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
}) {
  switch (condition.kind) {
    case "amountBetween":
      return (
        <div className="flex gap-2">
          <MoneyInput
            placeholder="از (تومان)"
            value={condition.min}
            onChange={(min) => onChange({ ...condition, min })}
          />
          <MoneyInput
            placeholder="تا (تومان)"
            value={condition.max}
            onChange={(max) => onChange({ ...condition, max })}
          />
        </div>
      );

    case "timeOfDay":
      return (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={condition.from ?? ""}
            onChange={(event) => onChange({ ...condition, from: event.target.value })}
            className="num flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-sm"
          />
          <span className="text-xs">تا</span>
          <input
            type="time"
            value={condition.to ?? ""}
            onChange={(event) => onChange({ ...condition, to: event.target.value })}
            className="num flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-sm"
          />
        </div>
      );

    case "dayOfWeek":
      return (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((label, day) => {
            const on = condition.days?.includes(day) ?? false;
            return (
              <button
                key={label}
                type="button"
                onClick={() =>
                  onChange({
                    ...condition,
                    days: on
                      ? condition.days?.filter((d) => d !== day)
                      : [...(condition.days ?? []), day],
                  })
                }
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  on
                    ? "border-transparent bg-[var(--color-brand)] font-bold text-white"
                    : "border-[var(--color-line)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      );

    case "direction":
      return (
        <select
          value={condition.direction ?? "out"}
          onChange={(event) =>
            onChange({ ...condition, direction: event.target.value as "in" | "out" })
          }
          className="bg-transparent text-sm"
        >
          <option value="out">خروجی</option>
          <option value="in">ورودی</option>
        </select>
      );

    case "account":
      return <AccountPicker condition={condition} onChange={onChange} />;

    case "textContains":
      return (
        <input
          value={condition.keywords?.join("، ") ?? ""}
          onChange={(event) =>
            onChange({ ...condition, keywords: event.target.value.split("،").map((w) => w.trim()) })
          }
          placeholder="کلمه‌ها با «،» — فقط یادداشت و طرف حساب جست‌وجو می‌شود"
          className="w-full rounded border border-[var(--color-line)] px-2 py-1 text-sm"
        />
      );
  }
}

function AccountPicker({
  condition,
  onChange,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  return (
    <select
      value={condition.accountId ?? ""}
      onChange={(event) => onChange({ ...condition, accountId: event.target.value || undefined })}
      className="bg-transparent text-sm"
    >
      <option value="">—</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.title}
        </option>
      ))}
    </select>
  );
}

function MoneyInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(Math.round(value / 10)));
  return (
    <input
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
        const rial = parseTomanInput(event.target.value);
        onChange(rial ?? undefined);
      }}
      className="num flex-1 rounded border border-[var(--color-line)] px-2 py-1 text-sm"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2">
      <span className="text-xs text-[var(--color-ink-soft)]">{label}</span>
      {children}
    </div>
  );
}
