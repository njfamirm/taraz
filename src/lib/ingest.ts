import { db } from "../db/db.ts";
import { createTransaction } from "../db/repo.ts";
import { autoCategorize } from "./categorize.ts";
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

export interface IngestOptions {
  /**
   * Keep a message the parser could not read as a `pending` transaction with
   * `parseConfidence: 0` instead of dropping it (PRD 4.1). Used for capture from
   * an approved sender, where a parse failure means our rules are behind the bank,
   * not that the message is junk. Bulk inbox import leaves this off, so scanning
   * history does not fill the ledger with unreadable rows.
   */
  keepUnparsed?: boolean;
}

export interface Ingested {
  result: IngestResult;
  /** The transaction this SMS produced — or matched, when duplicate. */
  transactionId: string | null;
}

/** Parse one SMS and persist it as a pending transaction. Never stores non-bank text. */
export async function ingestSms(sms: RawSms, options: IngestOptions = {}): Promise<IngestResult> {
  return (await ingestOne(sms, options)).result;
}

/** Same as {@link ingestSms}, but reports which transaction was created. */
export async function ingestOne(sms: RawSms, options: IngestOptions = {}): Promise<Ingested> {
  const parsed = parseSms(sms);
  if (!parsed && !options.keepUnparsed) return { result: "unparsed", transactionId: null };

  const occurredAt = parsed?.occurredAt ?? sms.receivedAt;
  const duplicate = await findDuplicate(sms, occurredAt);
  if (duplicate) return { result: "duplicate", transactionId: duplicate };

  const transactionId = await createTransaction({
    // An unreadable message still becomes a row: amount 0, raw text intact, so it
    // is visible in the inbox and re-parses once a rule covers it.
    amount: parsed?.amount ?? 0,
    direction: parsed?.direction ?? "out",
    occurredAt,
    balanceAfter: parsed?.balanceAfter ?? null,
    rawText: sms.body,
    rawSender: sms.sender,
    source: "sms",
    status: "pending",
    parseConfidence: parsed?.confidence ?? 0,
  });

  // Rules run at capture time (PRD 4.4): a correctly auto-categorized
  // transaction should already be filed by the time the user opens the app.
  const created = await db.transactions.get(transactionId);
  if (created) await autoCategorize(created);

  return { result: parsed ? "created" : "unparsed", transactionId };
}

export async function ingestMany(messages: RawSms[]): Promise<Record<IngestResult, number>> {
  const totals: Record<IngestResult, number> = { created: 0, duplicate: 0, unparsed: 0 };
  for (const sms of messages) {
    totals[await ingestSms(sms)] += 1;
  }
  return totals;
}
