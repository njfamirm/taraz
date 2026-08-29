import { registerPlugin, Capacitor } from "@capacitor/core";
import type { RawSms } from "../lib/sms.ts";

export interface SmsReaderPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  /** Reads the device SMS inbox, newest first. */
  listInbox(options?: { limit?: number; sinceMs?: number }): Promise<{ messages: RawSms[] }>;
  addListener(
    event: "smsReceived",
    handler: (sms: RawSms) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const SmsReader = registerPlugin<SmsReaderPlugin>("SmsReader");

/** The plugin only exists in the Android shell; the browser build runs paste-only. */
export const smsAvailable = Capacitor.isNativePlatform();
