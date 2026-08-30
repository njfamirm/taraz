import { useEffect, useState } from "react";
import { BellRing, Check, MessageSquare, ShieldCheck } from "lucide-react";
import { SmsReader, smsAvailable } from "../native/sms.ts";
import { parseSms, type RawSms } from "../lib/sms.ts";
import { ingestMany, ingestSms } from "../lib/ingest.ts";
import { formatToman } from "../lib/money.ts";
import { approveBankSender, listBankSenders, revokeBankSender } from "../lib/senders.ts";

interface SenderGroup {
  sender: string;
  messages: RawSms[];
  parseable: number;
}

/** Groups the inbox by sender and keeps only senders that look like a bank. */
function groupBySender(messages: RawSms[]): SenderGroup[] {
  const groups = new Map<string, SenderGroup>();
  for (const sms of messages) {
    let group = groups.get(sms.sender);
    if (!group) {
      group = { sender: sms.sender, messages: [], parseable: 0 };
      groups.set(sms.sender, group);
    }
    group.messages.push(sms);
    if (parseSms(sms)) group.parseable += 1;
  }
  return [...groups.values()]
    .filter((group) => group.parseable > 0)
    .sort((a, b) => b.parseable - a.parseable);
}

export function SmsImport() {
  const [granted, setGranted] = useState(false);
  const [groups, setGroups] = useState<SenderGroup[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [approved, setApproved] = useState<string[]>([]);
  const [notifyGranted, setNotifyGranted] = useState(true);

  useEffect(() => {
    void listBankSenders().then(setApproved);
    if (smsAvailable) {
      void SmsReader.checkNotificationPermission().then((r) => setNotifyGranted(r.granted));
    }
  }, []);

  async function enableNotifications() {
    const result = await SmsReader.requestNotificationPermission();
    setNotifyGranted(result.granted);
    if (!result.granted) setStatus("بدون اجازه‌ی اعلان، تراکنش‌ها بی‌صدا ثبت می‌شوند.");
  }

  /** Approving a sender is what turns background capture on for it (PRD 4.1). */
  async function toggleApproval(sender: string) {
    setApproved(
      approved.includes(sender) ? await revokeBankSender(sender) : await approveBankSender(sender),
    );
  }

  async function requestPermission() {
    const result = await SmsReader.requestPermission();
    setGranted(result.granted);
    if (!result.granted) setStatus("دسترسی پیامک داده نشد.");
  }

  async function scanInbox() {
    setBusy(true);
    setStatus(null);
    try {
      const { messages } = await SmsReader.listInbox({ limit: 500 });
      const found = groupBySender(messages);
      setGroups(found);
      if (found.length === 0) setStatus("پیامک بانکی قابل تشخیصی پیدا نشد.");
    } catch (error) {
      setStatus(`خطا در خواندن پیامک‌ها: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function importSender(group: SenderGroup) {
    setBusy(true);
    const totals = await ingestMany(group.messages);
    // Importing a sender means the user trusts it, so watch it from now on too.
    setApproved(await approveBankSender(group.sender));
    setStatus(
      `از ${group.sender}: ${totals.created} تراکنش تازه، ${totals.duplicate} تکراری، ${totals.unparsed} ناخوانا. از این پس پیامک‌های تازه‌ی این فرستنده خودکار ثبت می‌شوند.`,
    );
    setBusy(false);
  }

  async function importPaste() {
    const sms: RawSms = {
      id: `paste-${Date.now()}`,
      sender: "paste",
      body: paste,
      receivedAt: Date.now(),
    };
    const parsed = parseSms(sms);
    if (!parsed) {
      setStatus("این متن به عنوان تراکنش شناخته نشد.");
      return;
    }
    const result = await ingestSms(sms);
    setStatus(
      result === "created"
        ? `ثبت شد: ${parsed.direction === "in" ? "واریز" : "برداشت"} ${formatToman(parsed.amount, { unit: true })}`
        : "این پیامک قبلاً ثبت شده بود.",
    );
    setPaste("");
  }

  return (
    <div className="space-y-5 p-4">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold">
          <MessageSquare size={18} /> خواندن پیامک‌های بانکی
        </h2>

        {smsAvailable ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={granted ? scanInbox : requestPermission}
              disabled={busy}
              className="w-full rounded-lg bg-[var(--color-brand)] py-2.5 font-bold text-white disabled:opacity-50"
            >
              {granted ? "جست‌وجوی صندوق پیامک" : "اجازه دسترسی به پیامک"}
            </button>
            <p className="flex items-start gap-1.5 text-xs text-neutral-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              فقط پیامک‌های فرستنده‌هایی که خودت تأیید می‌کنی ذخیره می‌شوند و هیچ‌چیز از گوشی خارج
              نمی‌شود.
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-800">
            خواندن خودکار پیامک فقط روی اندروید کار می‌کند. اینجا می‌توانی متن پیامک را دستی بچسبانی.
          </p>
        )}

        {smsAvailable && !notifyGranted && (
          <button
            type="button"
            onClick={enableNotifications}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-brand)] py-2 text-sm font-bold text-[var(--color-brand)]"
          >
            <BellRing size={16} /> اجازه‌ی اعلان تراکنش تازه
          </button>
        )}

        {groups?.map((group) => (
          <button
            key={group.sender}
            type="button"
            onClick={() => importSender(group)}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-right disabled:opacity-50 dark:border-neutral-700"
          >
            <span className="text-sm font-bold">{group.sender}</span>
            <span className="text-xs text-neutral-500">
              {group.parseable} از {group.messages.length} قابل خواندن
            </span>
          </button>
        ))}
      </section>

      {approved.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold">فرستنده‌های تحت نظر</h3>
          <p className="text-xs text-neutral-500">
            پیامک تازه‌ی این فرستنده‌ها حتی وقتی اپ بسته است ثبت می‌شود و اعلان می‌گیری. با ضربه روی
            هرکدام، دنبال‌کردنش را متوقف می‌کنی.
          </p>
          <div className="flex flex-wrap gap-2">
            {approved.map((sender) => (
              <button
                key={sender}
                type="button"
                onClick={() => void toggleApproval(sender)}
                className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold dark:bg-neutral-800"
              >
                <Check size={12} className="text-[var(--color-brand)]" />
                {sender}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold">آزمایش با متن پیامک</h3>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="متن پیامک بانک را اینجا بچسبان"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button
          type="button"
          onClick={importPaste}
          disabled={paste.trim() === ""}
          className="w-full rounded-lg bg-neutral-100 py-2 text-sm font-bold disabled:opacity-50 dark:bg-neutral-800"
        >
          خواندن و ثبت
        </button>
      </section>

      {status && <p className="text-sm text-neutral-600 dark:text-neutral-300">{status}</p>}
    </div>
  );
}
