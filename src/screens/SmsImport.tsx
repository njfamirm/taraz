import { useEffect, useState } from "react";
import { BellRing, Check, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { SmsReader, smsAvailable } from "../native/sms.ts";
import { parseSms, type RawSms } from "../lib/sms.ts";
import { ingestMany } from "../lib/ingest.ts";
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

/**
 * Two questions and nothing else: what the app is allowed to do, and which
 * numbers it watches. Both states are read from the system on every visit —
 * a permission already granted must never look like it still needs asking.
 */
export function SmsImport() {
  // null until Android answers, so neither state is claimed before it is known.
  const [smsGranted, setSmsGranted] = useState<boolean | null>(null);
  const [notifyGranted, setNotifyGranted] = useState<boolean | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [groups, setGroups] = useState<SenderGroup[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read from the system, not from what we remember granting: Android is the
  // owner of both answers and the user can change them behind our back.
  useEffect(() => {
    let alive = true;
    async function load() {
      const senders = await listBankSenders();
      if (!alive) return;
      setApproved(senders);
      if (!smsAvailable) return;
      try {
        const sms = await SmsReader.checkPermission();
        const notify = await SmsReader.checkNotificationPermission();
        if (!alive) return;
        setSmsGranted(sms.granted);
        setNotifyGranted(notify.granted);
      } catch {
        // A plugin that will not answer is not a granted permission.
        if (!alive) return;
        setSmsGranted(false);
        setNotifyGranted(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  async function askSms() {
    setSmsGranted((await SmsReader.requestPermission()).granted);
  }

  async function askNotifications() {
    setNotifyGranted((await SmsReader.requestNotificationPermission()).granted);
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

  async function toggle(sender: string) {
    setApproved(
      approved.includes(sender) ? await revokeBankSender(sender) : await approveBankSender(sender),
    );
  }

  /** Watching a number covers what arrives next; history is a separate ask. */
  async function importHistory(group: SenderGroup) {
    setBusy(true);
    const totals = await ingestMany(group.messages);
    setStatus(`${group.sender}: ${totals.created} تراکنش تازه، ${totals.duplicate} تکراری.`);
    setBusy(false);
  }

  if (!smsAvailable) {
    return (
      <p className="rounded-xl bg-[var(--color-raised)] p-3 text-xs leading-6 text-[var(--color-ink-soft)]">
        خواندن پیامک فقط در نسخه‌ی اندروید کار می‌کند.
      </p>
    );
  }

  // A number already scanned but not approved is still worth showing, so the
  // list is the union of both.
  const candidates = groups?.map((group) => group.sender) ?? [];
  const senders = [...new Set([...approved, ...candidates])];

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="text-xs font-bold text-[var(--color-ink-faint)]">مجوزها</h4>
        <Permission
          icon={<MessageSquare size={16} />}
          label="خواندن پیامک"
          granted={smsGranted}
          onAsk={askSms}
        />
        <Permission
          icon={<BellRing size={16} />}
          label="اعلان تراکنش تازه"
          granted={notifyGranted}
          onAsk={askNotifications}
        />
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-ink-faint)]">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          مجوزی که یک‌بار داده شده از تنظیمات اندروید پس گرفته می‌شود، نه از اینجا.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--color-ink-faint)]">شماره‌های تحت نظر</h4>
          <button
            type="button"
            onClick={scanInbox}
            disabled={busy || smsGranted !== true}
            className="chip tap !min-h-8 text-[var(--color-brand)] disabled:opacity-40"
          >
            <RefreshCw size={13} /> جست‌وجوی صندوق
          </button>
        </div>

        {senders.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-soft)]">
            صندوق را جست‌وجو کن تا شماره‌های بانک پیدا شوند.
          </p>
        ) : (
          <ul className="space-y-2">
            {senders.map((sender) => {
              const group = groups?.find((candidate) => candidate.sender === sender);
              const watched = approved.includes(sender);
              return (
                <li key={sender} className="card flex items-center gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => void toggle(sender)}
                    className="tap flex flex-1 items-center gap-2 text-right"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full ${
                        watched
                          ? "bg-[var(--color-brand)] text-white"
                          : "border border-[var(--color-line)]"
                      }`}
                    >
                      {watched && <Check size={14} />}
                    </span>
                    <span className="num text-sm font-bold" dir="ltr">
                      {sender}
                    </span>
                  </button>
                  {group && (
                    <button
                      type="button"
                      onClick={() => void importHistory(group)}
                      disabled={busy}
                      className="chip tap !min-h-8 disabled:opacity-40"
                    >
                      ثبت {group.parseable} پیامک گذشته
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-[var(--color-ink-faint)]">
          فقط پیامک این شماره‌ها خوانده و ذخیره می‌شود — حتی وقتی اپ بسته است.
        </p>
      </section>

      {status && <p className="text-sm text-[var(--color-ink-soft)]">{status}</p>}
    </div>
  );
}

function Permission({
  icon,
  label,
  granted,
  onAsk,
}: {
  icon: React.ReactNode;
  label: string;
  granted: boolean | null;
  onAsk: () => void;
}) {
  return (
    <div className="card flex items-center justify-between gap-2 p-3">
      <span className="flex items-center gap-2 text-sm font-bold">
        {icon}
        {label}
      </span>
      {granted === null ? (
        <span className="text-xs text-[var(--color-ink-faint)]">…</span>
      ) : granted ? (
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--color-positive)]">
          <Check size={14} /> داده شده
        </span>
      ) : (
        <button type="button" onClick={onAsk} className="chip tap !min-h-8 chip-brand">
          اجازه بده
        </button>
      )}
    </div>
  );
}
