import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "../db/db.ts";
import {
  createPerson,
  createProject,
  createTag,
  listPeople,
  listProjects,
  listTags,
} from "../db/repo.ts";
import type { PersonKind, ProjectKind } from "../db/types.ts";
import { SmsImport } from "./SmsImport.tsx";
import { UpdateCard } from "../components/UpdateCard.tsx";
import { BackupCard } from "../components/BackupCard.tsx";
import { CategoryRules } from "./CategoryRules.tsx";

const PALETTE = ["#4B6FE0", "#E0764B", "#4BB2E0", "#9B4BE0", "#E04B7A", "#4BE0A6"];

function pickColor(seed: number): string {
  return PALETTE[seed % PALETTE.length]!;
}

export function Settings() {
  const projects = useLiveQuery(listProjects, [], []);
  const tags = useLiveQuery(listTags, [], []);
  const people = useLiveQuery(listPeople, [], []);

  return (
    <div className="divide-y divide-[var(--color-line)]">
      <Group
        title="پروژه‌ها"
        hint="جدا کردن هزینه‌ی شرکت از هزینه‌ی شخصی"
        items={projects.map((p) => ({ id: p.id, label: p.title, color: p.color }))}
        onAdd={(title) =>
          createProject({
            title,
            color: pickColor(projects.length),
            kind: "other" as ProjectKind,
            defaultReimbursable: false,
            archived: false,
          })
        }
        onRemove={(id) => db.projects.update(id, { archived: true })}
      />

      <Group
        title="برچسب‌ها"
        hint="مسطح و ساده — بدون سلسله‌مراتب"
        items={tags.map((t) => ({ id: t.id, label: t.title, color: t.color }))}
        onAdd={(title) => createTag({ title, color: pickColor(tags.length), archived: false })}
        onRemove={(id) => db.tags.update(id, { archived: true })}
      />

      <Group
        title="اشخاص"
        hint="طرف حساب‌های دنگ و طلب"
        items={people.map((p) => ({ id: p.id, label: p.name, color: p.color }))}
        onAdd={(name) =>
          createPerson({ name, color: pickColor(people.length), kind: "person" as PersonKind })
        }
        onRemove={(id) => db.people.delete(id)}
      />

      <section className="p-4">
        <h3 className="mb-2 text-sm font-bold">قاعده‌های دسته‌بندی</h3>
        <CategoryRules />
      </section>

      <section className="p-4">
        <h3 className="mb-2 text-sm font-bold">پشتیبان‌گیری</h3>
        <BackupCard />
      </section>

      <section className="p-4">
        <h3 className="mb-2 text-sm font-bold">پیامک‌ها</h3>
        <SmsImport />
      </section>

      <section className="p-4">
        <h3 className="mb-2 text-sm font-bold">به‌روزرسانی</h3>
        <UpdateCard />
      </section>
    </div>
  );
}

function Group({
  title,
  hint,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  items: { id: string; label: string; color: string }[];
  onAdd: (title: string) => unknown;
  onRemove: (id: string) => unknown;
}) {
  const [draft, setDraft] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    await onAdd(value);
    setDraft("");
  }

  return (
    <section className="p-4">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mb-2 text-xs text-[var(--color-ink-soft)]">{hint}</p>

      <ul className="mb-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onDoubleClick={() => onRemove(item.id)}
              style={{ borderColor: item.color }}
              className="rounded-full border-2 px-3 py-1 text-xs font-bold"
              title="برای حذف دوبار بزنید"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="افزودن…"
          className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="grid size-10 place-items-center rounded-lg bg-[var(--color-brand)] text-white"
          aria-label={`افزودن به ${title}`}
        >
          <Plus size={18} />
        </button>
      </form>
    </section>
  );
}
