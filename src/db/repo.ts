import { db } from "./db.ts";
import { newId } from "../lib/id.ts";
import type { Account, Project, Tag, Transaction } from "./types.ts";

type NewTransaction = Partial<Transaction> &
  Pick<Transaction, "amount" | "direction" | "occurredAt" | "source">;

export async function createTransaction(input: NewTransaction): Promise<string> {
  const now = Date.now();
  const tx: Transaction = {
    id: input.id ?? newId(),
    amount: input.amount,
    direction: input.direction,
    occurredAt: input.occurredAt,
    balanceAfter: input.balanceAfter ?? null,
    accountId: input.accountId ?? null,
    counterparty: input.counterparty ?? null,
    rawText: input.rawText ?? null,
    rawSender: input.rawSender ?? null,
    source: input.source,
    status: input.status ?? (input.source === "manual" ? "categorized" : "pending"),
    projectId: input.projectId ?? null,
    tagIds: input.tagIds ?? [],
    note: input.note ?? null,
    splitId: input.splitId ?? null,
    parseConfidence: input.parseConfidence ?? 1,
    matchedRuleId: input.matchedRuleId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.transactions.add(tx);
  return tx.id;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction("rw", db.transactions, db.splits, async () => {
    await db.splits.where("transactionId").equals(id).delete();
    await db.transactions.delete(id);
  });
}

export function listTransactions(): Promise<Transaction[]> {
  return db.transactions.orderBy("occurredAt").reverse().toArray();
}

export function listPending(): Promise<Transaction[]> {
  return db.transactions.where("status").equals("pending").reverse().sortBy("occurredAt");
}

export async function createAccount(input: Omit<Account, "id"> & { id?: string }) {
  const account: Account = { ...input, id: input.id ?? newId() };
  await db.accounts.add(account);
  return account.id;
}

export async function createProject(input: Omit<Project, "id"> & { id?: string }) {
  const project: Project = { ...input, id: input.id ?? newId() };
  await db.projects.add(project);
  return project.id;
}

export async function createTag(input: Omit<Tag, "id"> & { id?: string }) {
  const tag: Tag = { ...input, id: input.id ?? newId() };
  await db.tags.add(tag);
  return tag.id;
}
