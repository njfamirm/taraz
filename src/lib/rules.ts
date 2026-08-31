/**
 * Auto-categorization (PRD 4.4). Pure data, evaluated at capture time.
 *
 * Conditions describe the *shape* of a transaction — amount, time, account,
 * direction — never what a bank message seems to mean. `textContains` is the one
 * text condition and it reads only what the user wrote (note, counterparty),
 * never the raw SMS: guessing purpose from a bank's wording is exactly what this
 * app refuses to do.
 *
 * There is no learning loop. The first enabled rule whose conditions all match
 * wins, and the transaction records its id, so "why is this tagged food?" always
 * has one answer.
 */

import type { CategoryRule, Condition, Transaction } from "../db/types.ts";

/** The fields a rule may pre-fill on a transaction. */
export type RulePatch = Pick<Transaction, "projectId" | "tagIds" | "note" | "matchedRuleId">;

function minutesOfDay(ts: number): number {
  const date = new Date(ts);
  return date.getHours() * 60 + date.getMinutes();
}

/** "13:45" → 825. Returns null for anything unparseable, which never matches. */
function parseClock(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function matchesCondition(condition: Condition, tx: Transaction): boolean {
  switch (condition.kind) {
    case "amountBetween": {
      const { min, max } = condition;
      if (min !== undefined && tx.amount < min) return false;
      if (max !== undefined && tx.amount > max) return false;
      return min !== undefined || max !== undefined;
    }

    case "timeOfDay": {
      const from = parseClock(condition.from);
      const to = parseClock(condition.to);
      if (from === null || to === null) return false;
      const now = minutesOfDay(tx.occurredAt);
      // A window may wrap past midnight (22:00–02:00).
      return from <= to ? now >= from && now <= to : now >= from || now <= to;
    }

    case "dayOfWeek":
      return condition.days?.includes(new Date(tx.occurredAt).getDay()) ?? false;

    case "account":
      return condition.accountId !== undefined && tx.accountId === condition.accountId;

    case "direction":
      return condition.direction !== undefined && tx.direction === condition.direction;

    case "textContains": {
      const haystack = `${tx.note ?? ""} ${tx.counterparty ?? ""}`.toLowerCase();
      const keywords = condition.keywords?.filter((word) => word.trim() !== "") ?? [];
      return keywords.length > 0 && keywords.some((word) => haystack.includes(word.toLowerCase()));
    }
  }
}

/** Conditions are ANDed. A rule with no conditions matches nothing — never everything. */
export function matchesRule(rule: CategoryRule, tx: Transaction): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;
  return rule.conditions.every((condition) => matchesCondition(condition, tx));
}

/** Lowest `priority` number first; ties fall back to title so the order is stable. */
export function byPriority(a: CategoryRule, b: CategoryRule): number {
  return a.priority - b.priority || a.title.localeCompare(b.title, "fa");
}

export function firstMatch(rules: CategoryRule[], tx: Transaction): CategoryRule | null {
  return [...rules].sort(byPriority).find((rule) => matchesRule(rule, tx)) ?? null;
}

/**
 * What a matched rule does to a transaction. The user's own words win: an
 * existing note is never overwritten, and tags are merged, not replaced.
 */
export function rulePatch(rule: CategoryRule, tx: Transaction): RulePatch {
  const tagIds = [...new Set([...tx.tagIds, ...(rule.actions.tagIds ?? [])])];
  return {
    projectId: rule.actions.projectId ?? tx.projectId,
    tagIds,
    note: tx.note ?? rule.actions.note ?? null,
    matchedRuleId: rule.id,
  };
}
