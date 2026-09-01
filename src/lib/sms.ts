/**
 * SMS parsing. The bank-specific half lives in banks.ts: adding a bank is adding
 * a profile and its real messages to the fixtures, never editing this file.
 *
 * Every pattern is tried against every message. The sender is never consulted —
 * it is a phone number that varies per user and per bank, and deciding which
 * numbers may be read at all is the approved-sender list's job, not the parser's.
 *
 * What this deliberately does not do is guess what a purchase was *for*. A bank
 * SMS says how much moved and in which direction; anything beyond that is the
 * user's to say in the app.
 */

import { parse as parseJalali } from "date-fns-jalali";
import type { Direction } from "../db/types.ts";
import { toEnglishDigits } from "./money.ts";
import { ALL, bankKeyOf } from "./banks.ts";

export interface RawSms {
  id: string;
  sender: string;
  body: string;
  receivedAt: number;
}

export interface ParsedSms {
  amount: number; // integer Rial
  direction: Direction;
  occurredAt: number;
  balanceAfter: number | null;
  cardLast4: string | null;
  /** Whose wording this turned out to be. Informational — never a filter. */
  bankKey: string;
  confidence: number;
}

const CARD = /(?:کارت|حساب)\D{0,10}?(\d{4})\b|\*(\d{4})\b|(\d{4})\*/;
const DATE = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/;
/** Keshavarzi's stamp: `050609-12:44` — a two-digit Jalali year, then the clock. */
const COMPACT_STAMP = /\b(\d{2})(\d{2})(\d{2})-(\d{1,2}):(\d{2})\b/;
const TIME = /(\d{1,2}):(\d{2})/;

/** Persian/Arabic digits → ASCII, character folding, ZWNJ removal. */
export function normalizeSmsText(input: string): string {
  return toEnglishDigits(input)
    .replace(/‌/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function digits(input: string): number | null {
  const n = Number(input.replace(/[,٬\s]/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}

/** Explicit unit only — a wrong guess here is a 10× error. Rial when unstated. */
function multiplier(unit: string | undefined, text: string): number {
  if (unit) return /تومان|تومن/.test(unit) ? 10 : 1;
  return /تومان|تومن/.test(text) ? 10 : 1;
}

function firstMatch(patterns: RegExp[], text: string): RegExpExecArray | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}

function detectDirection(text: string): Direction | null {
  const out = ALL.out.filter((word) => text.includes(word)).map((word) => text.indexOf(word));
  const inn = ALL.in.filter((word) => text.includes(word)).map((word) => text.indexOf(word));
  const firstOut = out.length > 0 ? Math.min(...out) : -1;
  const firstIn = inn.length > 0 ? Math.min(...inn) : -1;
  if (firstOut >= 0 && firstIn >= 0) return firstOut < firstIn ? "out" : "in";
  if (firstOut >= 0) return "out";
  if (firstIn >= 0) return "in";
  return null;
}

function detectOccurredAt(text: string, fallback: number): { ts: number; exact: boolean } {
  const compact = COMPACT_STAMP.exec(text);
  if (compact) {
    // A two-digit year is this century's: 05 is 1405, not 0005.
    const stamp = `14${compact[1]}/${compact[2]}/${compact[3]} ${compact[4]}:${compact[5]}`;
    const parsed = parseJalali(stamp, "yyyy/M/d H:mm", new Date(fallback));
    if (!Number.isNaN(parsed.getTime())) return { ts: parsed.getTime(), exact: true };
  }

  const date = DATE.exec(text);
  if (!date) return { ts: fallback, exact: false };
  const day = `${date[1]}/${date[2]}/${date[3]}`;
  const time = TIME.exec(text);
  const stamp = time ? `${day} ${time[0]}` : day;
  const parsed = parseJalali(stamp, time ? "yyyy/M/d H:mm" : "yyyy/M/d", new Date(fallback));
  return Number.isNaN(parsed.getTime())
    ? { ts: fallback, exact: false }
    : { ts: parsed.getTime(), exact: true };
}

/** Returns null when the body does not look like a bank transaction at all. */
export function parseSms(sms: RawSms): ParsedSms | null {
  const text = normalizeSmsText(sms.body);

  // The balance is read first and cut out, so the amount patterns cannot latch
  // onto "موجودی: 115,272,713" when the bank states the amount without a label.
  const balanceMatch = firstMatch(ALL.balance, text);
  const rawBalance = balanceMatch?.[1] ? digits(balanceMatch[1]) : null;
  const withoutBalance = balanceMatch ? text.replace(balanceMatch[0], " ") : text;

  const amountMatch = firstMatch(ALL.amount, withoutBalance);
  const rawAmount = amountMatch?.[1] ? digits(amountMatch[1]) : null;
  if (rawAmount === null || rawAmount <= 0) return null;

  const direction = detectDirection(text);
  if (direction === null) return null;

  const unit = multiplier(amountMatch?.[2], text);
  const balanceUnit = multiplier(balanceMatch?.[2], text);
  const card = CARD.exec(text);
  const { ts, exact } = detectOccurredAt(text, sms.receivedAt);

  return {
    amount: rawAmount * unit,
    direction,
    occurredAt: ts,
    balanceAfter: rawBalance === null ? null : rawBalance * balanceUnit,
    cardLast4: card ? (card[1] ?? card[2] ?? card[3] ?? null) : null,
    bankKey: bankKeyOf(text),
    confidence: exact ? 0.9 : 0.7,
  };
}
