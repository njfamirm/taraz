import { db } from "../db/db.ts";
import { SmsReader, smsAvailable } from "../native/sms.ts";

const KEY = "bankSenders";

/**
 * The senders the user approved. PRD 4.1: the background receiver captures only
 * these, so this list is the on/off switch for background capture — the native
 * side gets a copy because it must decide with the WebView dead.
 */
export async function listBankSenders(): Promise<string[]> {
  const row = await db.settings.get(KEY);
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

async function save(senders: string[]): Promise<void> {
  await db.settings.put({ key: KEY, value: senders });
  if (smsAvailable) await SmsReader.setBankSenders({ senders });
}

export async function approveBankSender(sender: string): Promise<string[]> {
  const current = await listBankSenders();
  if (current.includes(sender)) return current;
  const next = [...current, sender];
  await save(next);
  return next;
}

export async function revokeBankSender(sender: string): Promise<string[]> {
  const next = (await listBankSenders()).filter((s) => s !== sender);
  await save(next);
  return next;
}

/** Native prefs and the database can drift (reinstall, restore); the DB wins. */
export async function syncBankSendersToNative(): Promise<void> {
  if (!smsAvailable) return;
  await SmsReader.setBankSenders({ senders: await listBankSenders() });
}
