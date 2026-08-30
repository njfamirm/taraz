/**
 * The reimbursement engine (PRD 3.5). All amounts are integer Rial.
 *
 * Rounding rule: when a split does not divide evenly the remainder goes to the
 * user's own share — never to a counterparty. Nobody is asked for a number the
 * app invented.
 */

import type { Share, Split, SplitMode, Transaction } from "../db/types.ts";

function emptyShare(personId: string | null, amount: number): Share {
  return { personId, amount, settledAt: null, settlementNote: null };
}

export interface ShareInput {
  personId: string | null;
  /** percent (0–100) for `percent`, Rial for `exact`. Ignored otherwise. */
  value?: number;
}

/**
 * Build the share list for a mode. `participants` always includes the user as
 * `{ personId: null }` except in `full-claim`, where the user's share is zero.
 */
export function computeShares(
  mode: SplitMode,
  amount: number,
  participants: ShareInput[],
): Share[] {
  switch (mode) {
    case "full-claim": {
      const other = participants.find((p) => p.personId !== null);
      if (!other) throw new Error("full-claim needs one counterparty");
      return [emptyShare(other.personId, amount)];
    }

    case "equal": {
      const people = dedupe(participants);
      const base = Math.floor(amount / people.length);
      const shares = people.map((p) => emptyShare(p.personId, base));
      return giveRemainderToMe(shares, amount);
    }

    case "percent": {
      const people = dedupe(participants);
      const shares = people.map((p) =>
        emptyShare(p.personId, Math.floor((amount * (p.value ?? 0)) / 100)),
      );
      return giveRemainderToMe(shares, amount);
    }

    case "exact": {
      const people = dedupe(participants);
      return people.map((p) => emptyShare(p.personId, Math.round(p.value ?? 0)));
    }
  }
}

function dedupe(participants: ShareInput[]): ShareInput[] {
  const seen = new Set<string | null>();
  return participants.filter((p) => (seen.has(p.personId) ? false : (seen.add(p.personId), true)));
}

/** Push any rounding leftover onto the user's own share, creating it if needed. */
function giveRemainderToMe(shares: Share[], amount: number): Share[] {
  const assigned = shares.reduce((sum, s) => sum + s.amount, 0);
  const remainder = amount - assigned;
  if (remainder === 0) return shares;

  const mine = shares.find((s) => s.personId === null);
  if (mine) {
    mine.amount += remainder;
    return shares;
  }
  return [...shares, emptyShare(null, remainder)];
}

export function sharesSum(shares: Share[]): number {
  return shares.reduce((sum, s) => sum + s.amount, 0);
}

/** Validation for `percent` (must total 100) and `exact` (must total the amount). */
export function validateSplit(
  mode: SplitMode,
  amount: number,
  participants: ShareInput[],
): string | null {
  if (mode === "percent") {
    const total = participants.reduce((sum, p) => sum + (p.value ?? 0), 0);
    return Math.abs(total - 100) < 0.001 ? null : "مجموع درصدها باید ۱۰۰ باشد";
  }
  if (mode === "exact") {
    const total = participants.reduce((sum, p) => sum + (p.value ?? 0), 0);
    return total === amount ? null : "مجموع مبالغ باید برابر مبلغ تراکنش باشد";
  }
  if (mode === "full-claim" && !participants.some((p) => p.personId !== null)) {
    return "یک طرف حساب انتخاب کنید";
  }
  if (mode === "equal" && participants.length < 2) {
    return "حداقل دو نفر لازم است";
  }
  return null;
}

/** The user's own cost: their share, or the whole amount when there is no split. */
export function realExpense(tx: Transaction, split: Split | undefined): number {
  if (!split) return tx.amount;
  const mine = split.shares.find((s) => s.personId === null);
  return mine?.amount ?? 0;
}

/** Unsettled amount owed to the user by one person. */
export function openClaims(splits: Split[], personId: string): number {
  return splits
    .flatMap((s) => s.shares)
    .filter((s) => s.personId === personId && s.settledAt === null)
    .reduce((sum, s) => sum + s.amount, 0);
}

export function totalOpenClaims(splits: Split[]): number {
  return splits
    .flatMap((s) => s.shares)
    .filter((s) => s.personId !== null && s.settledAt === null)
    .reduce((sum, s) => sum + s.amount, 0);
}
