/**
 * Minimal SMS parsing. Deliberately simple and code-based for now: the PRD's
 * data-driven ParseRule engine (RegEx Studio) comes later — this is enough to
 * prove the native path end to end.
 */

import { parse as parseJalali } from "date-fns-jalali";
import type { Direction } from "../db/types.ts";
import { toEnglishDigits } from "./money.ts";

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
  counterparty: string | null;
  cardLast4: string | null;
  confidence: number;
}

const OUT_KEYWORDS = ["برداشت", "خرید", "پرداخت", "انتقال از", "بدهکار", "کاهش", "کسر"];
const IN_KEYWORDS = ["واریز", "بستانکار", "افزایش", "دریافت", "انتقال به"];

const AMOUNT_LABEL =
  /(?:مبلغ|برداشت|واریز|خرید|پرداخت|انتقال|بدهکار|بستانکار)\D{0,12}?([\d,٬]{3,})/;
const BALANCE_LABEL = /(?:مانده|موجودی)\D{0,12}?([\d,٬]{3,})/;
const CARD = /(?:کارت|حساب)\D{0,10}?(\d{4})\b|\*(\d{4})\b|(\d{4})\*/;
const DATE = /(\d{4})\/(\d{1,2})\/(\d{1,2})/;
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

/** Which unit does this message quote its amounts in? Explicit only, Rial by default. */
function unitMultiplier(text: string): number {
  if (/تومان|تومن/.test(text)) return 10;
  return 1;
}

function detectDirection(text: string): Direction | null {
  const out = OUT_KEYWORDS.find((k) => text.includes(k));
  const inn = IN_KEYWORDS.find((k) => text.includes(k));
  if (out && inn) return text.indexOf(out) < text.indexOf(inn) ? "out" : "in";
  if (out) return "out";
  if (inn) return "in";
  return null;
}

function detectOccurredAt(text: string, fallback: number): { ts: number; exact: boolean } {
  const date = DATE.exec(text);
  if (!date) return { ts: fallback, exact: false };
  const time = TIME.exec(text);
  const stamp = time ? `${date[0]} ${time[0]}` : date[0];
  const pattern = time ? "yyyy/M/d H:mm" : "yyyy/M/d";
  const parsed = parseJalali(stamp, pattern, new Date(fallback));
  return Number.isNaN(parsed.getTime())
    ? { ts: fallback, exact: false }
    : { ts: parsed.getTime(), exact: true };
}

/** Merchant / counterparty: banks usually put it after "نزد", "بابت" or on its own line. */
function detectCounterparty(text: string): string | null {
  const labelled = /(?:بابت|نزد|از طرف|به نام|شرح)\s*[:-]?\s*([^\d\n]{2,30})/.exec(text);
  return labelled?.[1]?.trim() || null;
}

/** Returns null when the body does not look like a bank transaction at all. */
export function parseSms(sms: RawSms): ParsedSms | null {
  const text = normalizeSmsText(sms.body);

  const amountMatch = AMOUNT_LABEL.exec(text);
  const rawAmount = amountMatch?.[1] ? digits(amountMatch[1]) : null;
  if (rawAmount === null || rawAmount <= 0) return null;

  const direction = detectDirection(text);
  if (direction === null) return null;

  const unit = unitMultiplier(text);
  const balanceMatch = BALANCE_LABEL.exec(text);
  const rawBalance = balanceMatch?.[1] ? digits(balanceMatch[1]) : null;
  const card = CARD.exec(text);
  const { ts, exact } = detectOccurredAt(text, sms.receivedAt);

  return {
    amount: rawAmount * unit,
    direction,
    occurredAt: ts,
    balanceAfter: rawBalance === null ? null : rawBalance * unit,
    counterparty: detectCounterparty(text),
    cardLast4: card ? (card[1] ?? card[2] ?? card[3] ?? null) : null,
    confidence: exact ? 0.9 : 0.7,
  };
}
