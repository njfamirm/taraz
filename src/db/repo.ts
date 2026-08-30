import { db } from "./db.ts";
import { newId } from "../lib/id.ts";
import type {
  Account,
  Person,
  Project,
  Share,
  Split,
  SplitMode,
  Tag,
  Transaction,
} from "./types.ts";

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

export async function createPerson(input: Omit<Person, "id"> & { id?: string }) {
  const person: Person = { ...input, id: input.id ?? newId() };
  await db.people.add(person);
  return person.id;
}

export function listProjects(): Promise<Project[]> {
  return db.projects.filter((p) => !p.archived).toArray();
}

export function listTags(): Promise<Tag[]> {
  return db.tags.filter((t) => !t.archived).toArray();
}

export function listPeople(): Promise<Person[]> {
  return db.people.toArray();
}

export function listSplits(): Promise<Split[]> {
  return db.splits.toArray();
}

export function getSplit(transactionId: string): Promise<Split | undefined> {
  return db.splits.where("transactionId").equals(transactionId).first();
}

/** Replace the split on a transaction, or clear it when `shares` is null. */
export async function setSplit(
  transactionId: string,
  value: { mode: SplitMode; shares: Share[] } | null,
): Promise<void> {
  await db.transaction("rw", db.transactions, db.splits, async () => {
    await db.splits.where("transactionId").equals(transactionId).delete();
    if (!value) {
      await db.transactions.update(transactionId, { splitId: null, updatedAt: Date.now() });
      return;
    }
    const split: Split = { id: newId(), transactionId, ...value };
    await db.splits.add(split);
    await db.transactions.update(transactionId, { splitId: split.id, updatedAt: Date.now() });
  });
}

/** Settlement is per share: one friend can pay back while another has not. */
export async function settleShare(
  splitId: string,
  shareIndex: number,
  settled: boolean,
  note?: string,
): Promise<void> {
  const split = await db.splits.get(splitId);
  const share = split?.shares[shareIndex];
  if (!split || !share) return;
  share.settledAt = settled ? Date.now() : null;
  share.settlementNote = settled ? (note ?? null) : null;
  await db.splits.put(split);
}

/** Close every open share belonging to one person in a single operation. */
export async function settleAllForPerson(personId: string, note?: string): Promise<number> {
  const now = Date.now();
  let total = 0;
  await db.transaction("rw", db.splits, async () => {
    const splits = await db.splits.toArray();
    for (const split of splits) {
      let touched = false;
      for (const share of split.shares) {
        if (share.personId === personId && share.settledAt === null) {
          share.settledAt = now;
          share.settlementNote = note ?? null;
          total += share.amount;
          touched = true;
        }
      }
      if (touched) await db.splits.put(split);
    }
  });
  return total;
}

/** Idempotent first-run data so the categorization screens are never empty. */
export async function seedDefaults(): Promise<void> {
  // One rw transaction: the count and the insert must not interleave, or a
  // double-invoked effect seeds twice.
  await db.transaction("rw", db.projects, db.tags, async () => {
    if ((await db.projects.count()) === 0) {
      await db.projects.bulkAdd([
        {
          id: newId(),
          title: "شخصی",
          color: "#4B6FE0",
          kind: "personal",
          defaultReimbursable: false,
          archived: false,
        },
        {
          id: newId(),
          title: "شرکت",
          color: "#E0764B",
          kind: "client",
          defaultReimbursable: true,
          archived: false,
        },
      ]);
    }
    if ((await db.tags.count()) === 0) {
      await db.tags.bulkAdd(
        (
          [
            ["خوراک", "#E0764B"],
            ["حمل‌ونقل", "#4BB2E0"],
            ["خرید", "#9B4BE0"],
            ["قبض", "#E04B7A"],
            ["اشتراک", "#4BE0A6"],
          ] as const
        ).map(([title, color]) => ({ id: newId(), title, color, archived: false })),
      );
    }
  });
}
