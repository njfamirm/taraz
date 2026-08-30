import { registerPlugin, Capacitor } from "@capacitor/core";
import type { RawSms } from "../lib/sms.ts";

export interface CapturedBatch {
  /** Messages the manifest receiver queued while the app was not running. */
  messages: RawSms[];
  /** Set when the app was started by tapping a capture notification. */
  openCaptureId: string | null;
}

export interface SmsReaderPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  checkNotificationPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  /** Reads the device SMS inbox, newest first. */
  listInbox(options?: { limit?: number; sinceMs?: number }): Promise<{ messages: RawSms[] }>;
  /** The approved bank senders the background receiver is allowed to capture. */
  setBankSenders(options: { senders: string[] }): Promise<void>;
  /** Drains the background queue and clears its notifications. */
  consumeCaptured(): Promise<CapturedBatch>;
  addListener(
    event: "smsReceived",
    handler: (sms: RawSms) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    event: "captureTapped",
    handler: (event: { captureId: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const SmsReader = registerPlugin<SmsReaderPlugin>("SmsReader");

/** The plugin only exists in the Android shell; the browser build runs paste-only. */
export const smsAvailable = Capacitor.isNativePlatform();
