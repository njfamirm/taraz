import { ingestOne } from "./ingest.ts";
import { SmsReader, smsAvailable } from "../native/sms.ts";

/**
 * Drains what the background receiver captured while the app was not running
 * (PRD 4.1/4.3) and reports which transaction the tapped notification points at,
 * so the app can open it directly.
 */
export async function drainCaptured(): Promise<string | null> {
  if (!smsAvailable) return null;

  const { messages, openCaptureId } = await SmsReader.consumeCaptured();
  let openTransactionId: string | null = null;

  // The queue is already in arrival order.
  for (const sms of messages) {
    const { transactionId } = await ingestOne(sms);
    if (sms.id === openCaptureId && transactionId) openTransactionId = transactionId;
  }

  return openTransactionId;
}
