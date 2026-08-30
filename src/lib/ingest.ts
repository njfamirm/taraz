import { db } from "../db/db.ts";
import { createTransaction } from "../db/repo.ts";
import { parseSms, type RawSms } from "./sms.ts";

const DEDUPE_WINDOW_MS = 60_000;

/** PRD 3.1: banks re-send. Same sender + body within 60s is one transaction. */
async function findDuplicate(sms: RawSms, occurredAt: number): Promise<string | null> {
  const near = await db.transactions
    .where("[rawSender+occurredAt]")
    .between(
      [sms.sender, occurredAt - DEDUPE_WINDOW_MS],
      [sms.sender, occurredAt + DEDUPE_WINDOW_MS],
    )
    .toArray();
  return near.find((tx) => tx.rawText === sms.body)?.id ?? null;
}

export type IngestResult = "created" | "duplicate" | "unparsed";

export interface Ingested {
  result: IngestResult;
  /** The transaction this SMS produced — or matched, when duplicate. */
  transactionId: string | null;
}

/** Parse one SMS and persist it as a pending transaction. Never stores non-bank text. */
export async function ingestSms(sms: RawSms): Promise<IngestResult> {
  return (await ingestOne(sms)).result;
}

/** Same as {@link ingestSms}, but reports which transaction was created. */
export async function ingestOne(sms: RawSms): Promise<Ingested> {
  const parsed = parseSms(sms);
  if (!parsed) return { result: "unparsed", transactionId: null };
  const duplicate = await findDuplicate(sms, parsed.occurredAt);
  if (duplicate) return { result: "duplicate", transactionId: duplicate };

  const transactionId = await createTransaction({
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
  return { result: "created", transactionId };
}

export async function ingestMany(messages: RawSms[]): Promise<Record<IngestResult, number>> {
  const totals: Record<IngestResult, number> = { created: 0, duplicate: 0, unparsed: 0 };
  for (const sms of messages) {
    totals[await ingestSms(sms)] += 1;
  }
  return totals;
}
