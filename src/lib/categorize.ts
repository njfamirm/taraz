/**
 * The database side of auto-categorization: read the rules, apply the first
 * match, persist. Kept apart from `rules.ts` so the matching logic stays pure
 * and testable without a database.
 */

import { db } from "../db/db.ts";
import { listCategoryRules, setSplit, updateTransaction } from "../db/repo.ts";
import type { CategoryRule, Transaction } from "../db/types.ts";
import { computeShares } from "./split.ts";
import { firstMatch, rulePatch } from "./rules.ts";

/** Apply one rule's split action. Silently does nothing without a counterparty. */
async function applySplitAction(rule: CategoryRule, tx: Transaction): Promise<void> {
  const { splitMode, personId } = rule.actions;
  if (!splitMode || !personId || tx.amount <= 0) return;
  const participants =
    splitMode === "full-claim" ? [{ personId }] : [{ personId: null }, { personId }];
  await setSplit(tx.id, {
    mode: splitMode,
    shares: computeShares(splitMode, tx.amount, participants),
  });
}

/**
 * Categorize one transaction from the rule set. Returns the rule that fired, so
 * the capture notification can say the transaction is already filed (PRD 4.4).
 */
export async function autoCategorize(
  tx: Transaction,
  rules?: CategoryRule[],
): Promise<CategoryRule | null> {
  const rule = firstMatch(rules ?? (await listCategoryRules()), tx);
  if (!rule) return null;
  await updateTransaction(tx.id, rulePatch(rule, tx));
  await applySplitAction(rule, tx);
  return rule;
}

/**
 * Run the rules over transactions the user has not touched yet — the "apply to
 * history" affordance next to the preview. Only `pending` rows are eligible:
 * something already filed by hand is never re-filed by a rule.
 */
export async function applyRulesToPending(): Promise<number> {
  const rules = await listCategoryRules();
  const pending = await db.transactions.where("status").equals("pending").toArray();
  let touched = 0;
  for (const tx of pending) {
    if (await autoCategorize(tx, rules)) touched += 1;
  }
  return touched;
}
