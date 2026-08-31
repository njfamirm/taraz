import { expect, test } from "vite-plus/test";
import type { Person, Project, Split, Tag, Transaction } from "../db/types.ts";
import { buildReport, renderJson, renderMarkdown } from "./report.ts";

const DAY = 86_400_000;
const FROM = new Date(2025, 4, 1).getTime();
const TO = FROM + 30 * DAY;

function tx(patch: Partial<Transaction> & Pick<Transaction, "id" | "amount">): Transaction {
  return {
    direction: "out",
    occurredAt: FROM + DAY,
    balanceAfter: null,
    accountId: null,
    counterparty: null,
    rawText: "پیامک بانک",
    rawSender: "+98912",
    source: "sms",
    status: "categorized",
    projectId: null,
    tagIds: [],
    note: null,
    splitId: null,
    parseConfidence: 0.9,
    matchedRuleId: null,
    createdAt: FROM,
    updatedAt: FROM,
    ...patch,
  };
}

const projects: Project[] = [
  {
    id: "p1",
    title: "شرکت",
    color: "#000",
    kind: "client",
    defaultReimbursable: true,
    archived: false,
  },
];
const tags: Tag[] = [{ id: "g1", title: "خوراک", color: "#000", archived: false }];
const people: Person[] = [{ id: "h1", name: "علی", color: "#000", kind: "person" }];

const splits: Split[] = [
  {
    id: "s1",
    transactionId: "b",
    mode: "full-claim",
    shares: [{ personId: "h1", amount: 2_000_000, settledAt: null, settlementNote: null }],
  },
];

const transactions = [
  tx({ id: "a", amount: 1_000_000, tagIds: ["g1"], note: "ناهار" }),
  tx({ id: "b", amount: 2_000_000, projectId: "p1", splitId: "s1" }),
  tx({ id: "c", amount: 5_000_000, direction: "in", occurredAt: FROM + 2 * DAY }),
  tx({ id: "old", amount: 9_000_000, occurredAt: FROM - DAY }),
  tx({ id: "ignored", amount: 8_000_000, status: "ignored" }),
  tx({ id: "broken", amount: 0, status: "pending", parseConfidence: 0 }),
];

const report = buildReport({ transactions, splits, projects, tags, people, from: FROM, to: TO });

test("totals are in Toman and exclude claims from real expense", () => {
  expect(report.totals).toEqual({
    income: 500_000,
    expense: 300_000,
    realExpense: 100_000, // the fully claimed 2,000,000 Rial is someone else's
    net: 400_000,
  });
});

test("the period bounds the data", () => {
  expect(report.quality.transactions).toBe(4); // "old" and "ignored" are out
  expect(report.quality.pending).toBe(1);
  expect(report.quality.unparsed).toBe(1);
});

test("breakdowns count rows and sum the user's own share", () => {
  expect(report.byProject).toEqual([
    { label: "بدون پروژه", expense: 100_000, count: 2 },
    { label: "شرکت", expense: 0, count: 1 },
  ]);
  expect(report.byTag).toEqual([{ label: "خوراک", expense: 100_000, count: 1 }]);
});

test("open claims are a running balance, per person", () => {
  expect(report.openClaims).toEqual([{ person: "علی", amount: 200_000 }]);
});

test("the daily series has one row per active day", () => {
  expect(report.daily).toEqual([
    { date: "1404/02/12", income: 0, expense: 300_000 },
    { date: "1404/02/13", income: 500_000, expense: 0 },
  ]);
});

test("largest transactions are labelled from the user's own words only", () => {
  expect(report.largest[0]).toMatchObject({
    amount: 500_000,
    direction: "in",
    label: "بدون توضیح",
  });
  expect(report.largest.map((row) => row.label)).toContain("ناهار · خوراک");
});

test("neither rendering leaks raw SMS or senders", () => {
  const markdown = renderMarkdown(report);
  const json = renderJson(report);
  for (const output of [markdown, json]) {
    expect(output).not.toContain("پیامک بانک");
    expect(output).not.toContain("+98912");
  }
  expect(markdown).toContain("تومان");
  expect(JSON.parse(json)).toMatchObject({ schema: "taraz.report.v1", unit: "toman" });
});
