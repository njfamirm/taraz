import Dexie, { type EntityTable } from "dexie";
import type {
  Account,
  CategoryRule,
  ParseRule,
  Person,
  Project,
  Setting,
  Split,
  Tag,
  Transaction,
} from "./types.ts";

export class TarazDB extends Dexie {
  transactions!: EntityTable<Transaction, "id">;
  accounts!: EntityTable<Account, "id">;
  projects!: EntityTable<Project, "id">;
  tags!: EntityTable<Tag, "id">;
  people!: EntityTable<Person, "id">;
  splits!: EntityTable<Split, "id">;
  parseRules!: EntityTable<ParseRule, "id">;
  categoryRules!: EntityTable<CategoryRule, "id">;
  settings!: EntityTable<Setting, "key">;

  constructor() {
    super("taraz");
    this.version(1).stores({
      transactions:
        "id, occurredAt, status, direction, accountId, projectId, splitId, *tagIds, [rawSender+occurredAt]",
      accounts: "id, bankKey, last4, archived",
      projects: "id, kind, archived",
      tags: "id, title, archived",
      people: "id, kind",
      splits: "id, transactionId",
      parseRules: "id, bankKey, priority, enabled",
      categoryRules: "id, priority, enabled",
      settings: "key",
    });
  }
}

export const db = new TarazDB();
