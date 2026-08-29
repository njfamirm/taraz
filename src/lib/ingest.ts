import { db } from "../db/db.ts";
import { createTransaction } from "../db/repo.ts";
import { parseSms, type RawSms } from "./sms.ts";

const DEDUPE_WINDOW_MS = 60_000;

/** PRD 3.1: banks re-send. Same sender + body within 60s is one transaction. */
async function isDuplicate(sms: RawSms, occurredAt: number): Promise<boolean> {
  const near = await db.transactions
    .where("[rawSender+occurredAt]")
    .between(
      [sms.sender, occurredAt - DEDUPE_WINDOW_MS],
      [sms.sender, occurredAt + DEDUPE_WINDOW_MS],
    )
    .toArray();
  return near.some((tx) => tx.rawText === sms.body);
}

export type IngestResult = "created" | "duplicate" | "unparsed";

/** Parse one SMS and persist it as a pending transaction. Never stores non-bank text. */
export async function ingestSms(sms: RawSms): Promise<IngestResult> {
  const parsed = parseSms(sms);
  if (!parsed) return "unparsed";
  if (await isDuplicate(sms, parsed.occurredAt)) return "duplicate";

  await createTransaction({
    amount: parsed.amount,
    direction: parsed.direction,
    occurredAt: parsed.occurredAt,
    balanceAfter: parsed.balanceAfter,
    counterparty: parsed.counterparty,
    rawText: sms.body,
    rawSender: sms.sender,
    source: "sms",
    status: "pending",
    parseConfidence: parsed.confidence,
  });
  return "created";
}

export async function ingestMany(messages: RawSms[]): Promise<Record<IngestResult, number>> {
  const totals: Record<IngestResult, number> = { created: 0, duplicate: 0, unparsed: 0 };
  for (const sms of messages) {
    totals[await ingestSms(sms)] += 1;
  }
  return totals;
}
