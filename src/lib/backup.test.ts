import { expect, test } from "vite-plus/test";
import { BACKUP_SCHEMA, backupFilename, parseBackup } from "./backup.ts";

const EMPTY = {
  schema: BACKUP_SCHEMA,
  exportedAt: 0,
  transactions: [],
  accounts: [],
  projects: [],
  tags: [],
  people: [],
  splits: [],
  categoryRules: [],
  settings: [],
};

test("a well-formed backup round-trips", () => {
  expect(parseBackup(JSON.stringify(EMPTY)).schema).toBe(BACKUP_SCHEMA);
});

test("junk fails loudly instead of half-importing", () => {
  expect(() => parseBackup("nope")).toThrow("JSON");
  expect(() => parseBackup('{"schema":"other"}')).toThrow("تراز");
  const { splits: _dropped, ...missing } = EMPTY;
  expect(() => parseBackup(JSON.stringify(missing))).toThrow("splits");
});

test("the filename carries the date", () => {
  expect(backupFilename(Date.UTC(2025, 0, 9))).toBe("taraz-backup-2025-01-09.json");
});
