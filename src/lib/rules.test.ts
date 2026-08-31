import { expect, test } from "vite-plus/test";
import type { CategoryRule, Transaction } from "../db/types.ts";
import { firstMatch, matchesRule, rulePatch } from "./rules.ts";

function tx(patch: Partial<Transaction> = {}): Transaction {
  const now = new Date(2025, 4, 12, 13, 0).getTime(); // a Monday, 13:00 local
  return {
    id: "t1",
    amount: 500_000,
    direction: "out",
    occurredAt: now,
    balanceAfter: null,
    accountId: null,
    counterparty: null,
    rawText: "۵۰۰,۰۰۰ ریال از حساب شما پرید",
    rawSender: "+98912",
    source: "sms",
    status: "pending",
    projectId: null,
    tagIds: [],
    note: null,
    splitId: null,
    parseConfidence: 0.9,
    matchedRuleId: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function rule(patch: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "r1",
    title: "ناهار",
    enabled: true,
    priority: 10,
    conditions: [],
    actions: {},
    ...patch,
  };
}

test("amountBetween is inclusive on both ends", () => {
  const r = rule({ conditions: [{ kind: "amountBetween", min: 500_000, max: 500_000 }] });
  expect(matchesRule(r, tx())).toBe(true);
  expect(matchesRule(r, tx({ amount: 500_001 }))).toBe(false);
});

test("an open-ended amount range still matches", () => {
  expect(matchesRule(rule({ conditions: [{ kind: "amountBetween", min: 1000 }] }), tx())).toBe(
    true,
  );
  expect(matchesRule(rule({ conditions: [{ kind: "amountBetween", max: 1000 }] }), tx())).toBe(
    false,
  );
});

test("a time window that wraps past midnight", () => {
  const night = rule({ conditions: [{ kind: "timeOfDay", from: "22:00", to: "02:00" }] });
  expect(matchesRule(night, tx({ occurredAt: new Date(2025, 4, 12, 23, 30).getTime() }))).toBe(
    true,
  );
  expect(matchesRule(night, tx({ occurredAt: new Date(2025, 4, 12, 1, 30).getTime() }))).toBe(true);
  expect(matchesRule(night, tx())).toBe(false);
});

test("dayOfWeek, account and direction", () => {
  expect(matchesRule(rule({ conditions: [{ kind: "dayOfWeek", days: [1] }] }), tx())).toBe(true);
  expect(matchesRule(rule({ conditions: [{ kind: "dayOfWeek", days: [5] }] }), tx())).toBe(false);
  expect(
    matchesRule(
      rule({ conditions: [{ kind: "account", accountId: "a1" }] }),
      tx({ accountId: "a1" }),
    ),
  ).toBe(true);
  expect(matchesRule(rule({ conditions: [{ kind: "direction", direction: "out" }] }), tx())).toBe(
    true,
  );
});

test("textContains reads the user's words, never the bank's", () => {
  const r = rule({ conditions: [{ kind: "textContains", keywords: ["ریال"] }] });
  expect(matchesRule(r, tx())).toBe(false);
  expect(matchesRule(r, tx({ note: "بابت ریال‌های قرضی" }))).toBe(true);
});

test("conditions are ANDed", () => {
  const r = rule({
    conditions: [
      { kind: "direction", direction: "out" },
      { kind: "amountBetween", min: 10_000_000 },
    ],
  });
  expect(matchesRule(r, tx())).toBe(false);
  expect(matchesRule(r, tx({ amount: 12_000_000 }))).toBe(true);
});

test("a rule with no conditions matches nothing", () => {
  expect(matchesRule(rule(), tx())).toBe(false);
});

test("a disabled rule never fires", () => {
  const r = rule({ enabled: false, conditions: [{ kind: "direction", direction: "out" }] });
  expect(matchesRule(r, tx())).toBe(false);
});

test("the lowest priority wins", () => {
  const conditions = [{ kind: "direction", direction: "out" } as const];
  const low = rule({ id: "low", priority: 1, conditions });
  const high = rule({ id: "high", priority: 9, conditions });
  expect(firstMatch([high, low], tx())?.id).toBe("low");
});

test("the patch merges tags and never overwrites the user's note", () => {
  const r = rule({ actions: { projectId: "p1", tagIds: ["t2"], note: "قاعده" } });
  expect(rulePatch(r, tx({ tagIds: ["t1"], note: "دست‌نویس" }))).toEqual({
    projectId: "p1",
    tagIds: ["t1", "t2"],
    note: "دست‌نویس",
    matchedRuleId: "r1",
  });
});
