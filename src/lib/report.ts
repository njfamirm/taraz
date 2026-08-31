/**
 * The AI-ready export (PRD 4.6).
 *
 * Two renderings of one report: Markdown for reading in a chat, compact JSON for
 * precise analysis. Both are self-describing — they state their unit, their
 * calendar, and what "real expense" means — so the model never has to guess, and
 * both are stripped of raw SMS text, card tails and account ids. Titles and
 * notes the user wrote stay, because that is where the meaning is.
 */

import { format as formatJalali } from "date-fns-jalali";
import type { Person, Project, Split, Tag, Transaction } from "../db/types.ts";
import { rialToToman } from "./money.ts";
import { realExpense } from "./split.ts";

export interface ReportInput {
  transactions: Transaction[];
  splits: Split[];
  projects: Project[];
  tags: Tag[];
  people: Person[];
  from: number;
  /** Exclusive. */
  to: number;
}

export interface Breakdown {
  label: string;
  expense: number;
  count: number;
}

export interface Report {
  period: { fromJalali: string; toJalali: string };
  totals: { income: number; expense: number; realExpense: number; net: number };
  byProject: Breakdown[];
  byTag: Breakdown[];
  /** One entry per day that had activity: [jalali date, income, expense]. */
  daily: { date: string; income: number; expense: number }[];
  openClaims: { person: string; amount: number }[];
  largest: { date: string; amount: number; direction: "in" | "out"; label: string }[];
  quality: { transactions: number; pending: number; unparsed: number };
}

const LARGEST_COUNT = 10;

function jalali(ts: number): string {
  return formatJalali(ts, "yyyy/MM/dd");
}

/** Everything in the report is Toman, rounded — the model reads money, not Rial. */
function toman(rial: number): number {
  return rialToToman(rial);
}

export function buildReport(input: ReportInput): Report {
  const { splits, projects, tags, people, from, to } = input;
  const inRange = input.transactions.filter(
    (tx) => tx.occurredAt >= from && tx.occurredAt < to && tx.status !== "ignored",
  );
  const splitByTx = new Map(splits.map((split) => [split.transactionId, split]));
  const mine = (tx: Transaction) => realExpense(tx, splitByTx.get(tx.id));

  const income = inRange.filter((tx) => tx.direction === "in");
  const outgoing = inRange.filter((tx) => tx.direction === "out");
  const incomeTotal = sum(income, (tx) => tx.amount);
  const expenseTotal = sum(outgoing, (tx) => tx.amount);
  const realTotal = sum(outgoing, mine);

  const byProject = projects
    .map((project) =>
      breakdown(
        project.title,
        outgoing.filter((tx) => tx.projectId === project.id),
        mine,
      ),
    )
    .concat(
      breakdown(
        "بدون پروژه",
        outgoing.filter((tx) => tx.projectId === null),
        mine,
      ),
    )
    .filter((row) => row.count > 0)
    .sort((a, b) => b.expense - a.expense);

  const byTag = tags
    .map((tag) =>
      breakdown(
        tag.title,
        outgoing.filter((tx) => tx.tagIds.includes(tag.id)),
        mine,
      ),
    )
    .filter((row) => row.count > 0)
    .sort((a, b) => b.expense - a.expense);

  const days = new Map<string, { income: number; expense: number }>();
  for (const tx of inRange) {
    const key = jalali(tx.occurredAt);
    const day = days.get(key) ?? { income: 0, expense: 0 };
    if (tx.direction === "in") day.income += toman(tx.amount);
    else day.expense += toman(tx.amount);
    days.set(key, day);
  }

  // Claims are a running balance, not a period figure: what is open is open
  // regardless of when the transaction behind it happened.
  const openClaims = people
    .map((person) => ({
      person: person.name,
      amount: toman(
        sum(
          splits.flatMap((split) => split.shares),
          (share) => (share.personId === person.id && share.settledAt === null ? share.amount : 0),
        ),
      ),
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));
  const tagTitle = new Map(tags.map((t) => [t.id, t.title]));
  const largest = [...inRange]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, LARGEST_COUNT)
    .map((tx) => ({
      date: jalali(tx.occurredAt),
      amount: toman(tx.amount),
      direction: tx.direction,
      label: describe(tx, projectTitle, tagTitle),
    }));

  return {
    period: { fromJalali: jalali(from), toJalali: jalali(to - 1) },
    totals: {
      income: toman(incomeTotal),
      expense: toman(expenseTotal),
      realExpense: toman(realTotal),
      net: toman(incomeTotal - realTotal),
    },
    byProject,
    byTag,
    daily: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({ date, ...day })),
    openClaims,
    largest,
    quality: {
      transactions: inRange.length,
      pending: inRange.filter((tx) => tx.status === "pending").length,
      unparsed: inRange.filter((tx) => tx.parseConfidence === 0 && tx.source === "sms").length,
    },
  };
}

function breakdown(
  label: string,
  rows: Transaction[],
  mine: (tx: Transaction) => number,
): Breakdown {
  return { label, expense: toman(sum(rows, mine)), count: rows.length };
}

function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

/** A human label built only from what the user wrote or chose. */
function describe(
  tx: Transaction,
  projects: Map<string, string>,
  tags: Map<string, string>,
): string {
  const parts = [
    tx.note,
    tx.counterparty,
    tx.projectId ? projects.get(tx.projectId) : null,
    ...tx.tagIds.map((id) => tags.get(id) ?? null),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? [...new Set(parts)].join(" · ") : "بدون توضیح";
}

const PREAMBLE = [
  "همه‌ی مبالغ به **تومان** است.",
  "تاریخ‌ها **شمسی (جلالی)** هستند.",
  '"هزینه‌ی واقعی" یعنی سهم خود کاربر: مبالغی که قرار است از دیگران پس گرفته شود (طلب‌ها) از آن کم شده است.',
  '"خالص" = درآمد منهای هزینه‌ی واقعی.',
];

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push(`# گزارش مالی ${report.period.fromJalali} تا ${report.period.toJalali}`, "");
  lines.push(...PREAMBLE.map((line) => `- ${line}`), "");

  lines.push("## جمع کل", "");
  lines.push("| عنوان | تومان |", "| --- | --- |");
  lines.push(`| درآمد | ${report.totals.income} |`);
  lines.push(`| هزینه‌ی ناخالص | ${report.totals.expense} |`);
  lines.push(`| هزینه‌ی واقعی | ${report.totals.realExpense} |`);
  lines.push(`| خالص | ${report.totals.net} |`, "");

  lines.push(...table("به تفکیک پروژه", report.byProject));
  lines.push(...table("به تفکیک برچسب", report.byTag));

  if (report.daily.length > 0) {
    lines.push("## روزانه", "");
    lines.push("| تاریخ | درآمد | هزینه |", "| --- | --- | --- |");
    lines.push(...report.daily.map((day) => `| ${day.date} | ${day.income} | ${day.expense} |`));
    lines.push("");
  }

  if (report.openClaims.length > 0) {
    lines.push("## طلب‌های باز", "");
    lines.push("| شخص | تومان |", "| --- | --- |");
    lines.push(...report.openClaims.map((row) => `| ${row.person} | ${row.amount} |`));
    lines.push("");
  }

  if (report.largest.length > 0) {
    lines.push("## بزرگ‌ترین تراکنش‌ها", "");
    lines.push("| تاریخ | جهت | تومان | شرح |", "| --- | --- | --- | --- |");
    lines.push(
      ...report.largest.map(
        (tx) =>
          `| ${tx.date} | ${tx.direction === "in" ? "ورودی" : "خروجی"} | ${tx.amount} | ${tx.label} |`,
      ),
    );
    lines.push("");
  }

  lines.push("## کیفیت داده", "");
  lines.push(
    `- ${report.quality.transactions} تراکنش در این بازه`,
    `- ${report.quality.pending} تراکنش هنوز دسته‌بندی نشده`,
    `- ${report.quality.unparsed} پیامک که پارسر نتوانسته بخواند (مبلغشان صفر ثبت شده)`,
    "",
  );

  return lines.join("\n");
}

function table(title: string, rows: Breakdown[]): string[] {
  if (rows.length === 0) return [];
  return [
    `## ${title}`,
    "",
    "| عنوان | هزینه‌ی واقعی (تومان) | تعداد |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.label} | ${row.expense} | ${row.count} |`),
    "",
  ];
}

export function renderJson(report: Report): string {
  return JSON.stringify(
    {
      schema: "taraz.report.v1",
      unit: "toman",
      calendar: "jalali",
      definitions: {
        realExpense: "user's own share; reimbursable claims excluded",
        net: "income - realExpense",
      },
      ...report,
    },
    null,
    0,
  );
}
