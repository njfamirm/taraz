/**
 * Backup and restore (PRD 4.7). One JSON file with the whole database — rules
 * and settings included — because the device is the only copy. Manual, local,
 * no cloud.
 */

import { db } from "../db/db.ts";
import type {
  Account,
  CategoryRule,
  Person,
  Project,
  Setting,
  Split,
  Tag,
  Transaction,
} from "../db/types.ts";

export const BACKUP_SCHEMA = "taraz.backup.v1";

export interface Backup {
  schema: typeof BACKUP_SCHEMA;
  exportedAt: number;
  transactions: Transaction[];
  accounts: Account[];
  projects: Project[];
  tags: Tag[];
  people: Person[];
  splits: Split[];
  categoryRules: CategoryRule[];
  settings: Setting[];
}

export type RestoreMode = "replace" | "merge";

export async function exportBackup(): Promise<Backup> {
  const [transactions, accounts, projects, tags, people, splits, categoryRules, settings] =
    await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.projects.toArray(),
      db.tags.toArray(),
      db.people.toArray(),
      db.splits.toArray(),
      db.categoryRules.toArray(),
      db.settings.toArray(),
    ]);
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: Date.now(),
    transactions,
    accounts,
    projects,
    tags,
    people,
    splits,
    categoryRules,
    settings,
  };
}

export function backupFilename(exportedAt: number = Date.now()): string {
  return `taraz-backup-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;
}

/**
 * Reject anything that is not a Taraz backup before touching the database. A
 * wrong file must fail loudly, not half-import.
 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("فایل JSON معتبر نیست");
  }
  const backup = data as Partial<Backup>;
  if (backup?.schema !== BACKUP_SCHEMA) throw new Error("این فایل پشتیبان تراز نیست");
  for (const key of TABLES) {
    if (!Array.isArray(backup[key])) throw new Error(`بخش «${key}» در فایل نیست`);
  }
  // A backup written before parse rules were dropped carries a table that no
  // longer exists; restoring must ignore it, not fail on it.
  return backup as Backup;
}

const TABLES = [
  "transactions",
  "accounts",
  "projects",
  "tags",
  "people",
  "splits",
  "categoryRules",
  "settings",
] as const;

export interface RestoreSummary {
  mode: RestoreMode;
  rows: number;
}

/**
 * `replace` wipes every table first; `merge` writes rows over any existing row
 * with the same id (`put`), keeping whatever the backup does not mention.
 */
export async function restoreBackup(backup: Backup, mode: RestoreMode): Promise<RestoreSummary> {
  const tables = TABLES.map((key) => db.table(key));
  let rows = 0;
  await db.transaction("rw", tables, async () => {
    for (const key of TABLES) {
      const table = db.table(key);
      if (mode === "replace") await table.clear();
      await table.bulkPut(backup[key] as unknown[]);
      rows += backup[key].length;
    }
  });
  return { mode, rows };
}
