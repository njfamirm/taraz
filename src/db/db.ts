import Dexie, { type EntityTable } from "dexie";
import type {
  Account,
  CategoryRule,
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
      categoryRules: "id, priority, enabled",
      settings: "key",
    });
    // Parsing is code, not user-editable rules (PRD 4.2), so the table it would
    // have lived in is gone. Dexie needs the drop declared to remove it.
    this.version(2).stores({ parseRules: null });
  }
}

export const db = new TarazDB();
