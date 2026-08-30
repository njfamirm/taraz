import { expect, test } from "vite-plus/test";
import { computeShares, realExpense, openClaims, validateSplit } from "./split.ts";
import type { Split, Transaction } from "../db/types.ts";

const tx = (amount: number): Transaction => ({ id: "t", amount, direction: "out" }) as Transaction;

test("gives the whole amount to the counterparty in full-claim", () => {
  const shares = computeShares("full-claim", 500_000, [{ personId: "p1" }]);
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ personId: "p1", amount: 500_000, settledAt: null });
});

test("splits evenly and hands the remainder to me", () => {
  const shares = computeShares("equal", 100, [
    { personId: null },
    { personId: "a" },
    { personId: "b" },
  ]);
  expect(shares.map((s) => s.amount)).toEqual([34, 33, 33]);
  expect(shares.find((s) => s.personId === null)!.amount).toBe(34);
});

test("never invents a number for a counterparty in percent mode", () => {
  const shares = computeShares("percent", 1001, [
    { personId: null, value: 33.3 },
    { personId: "a", value: 66.7 },
  ]);
  expect(shares.find((s) => s.personId === "a")!.amount).toBe(667);
  expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(1001);
});

test("uses exact amounts as given", () => {
  const shares = computeShares("exact", 900, [
    { personId: null, value: 400 },
    { personId: "a", value: 500 },
  ]);
  expect(shares.map((s) => s.amount)).toEqual([400, 500]);
});

test("rejects percentages that do not total 100", () => {
  expect(validateSplit("percent", 100, [{ personId: null, value: 60 }])).not.toBeNull();
});
test("rejects exact amounts that do not total the transaction", () => {
  expect(validateSplit("exact", 900, [{ personId: null, value: 400 }])).not.toBeNull();
});
test("accepts a balanced exact split", () => {
  expect(
    validateSplit("exact", 900, [
      { personId: null, value: 400 },
      { personId: "a", value: 500 },
    ]),
  ).toBeNull();
});

test("is the full amount with no split", () => {
  expect(realExpense(tx(250_000), undefined)).toBe(250_000);
});

test("is zero for a proxy purchase", () => {
  const split: Split = {
    id: "s",
    transactionId: "t",
    mode: "full-claim",
    shares: computeShares("full-claim", 250_000, [{ personId: "p1" }]),
  };
  expect(realExpense(tx(250_000), split)).toBe(0);
});

test("ignores settled shares", () => {
  const splits: Split[] = [
    {
      id: "s",
      transactionId: "t",
      mode: "equal",
      shares: [
        { personId: null, amount: 50, settledAt: null, settlementNote: null },
        { personId: "a", amount: 50, settledAt: null, settlementNote: null },
        { personId: "a", amount: 70, settledAt: 1, settlementNote: null },
      ],
    },
  ];
  expect(openClaims(splits, "a")).toBe(50);
});
