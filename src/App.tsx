import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell, type TabKey } from "./components/AppShell.tsx";
import { Inbox } from "./screens/Inbox.tsx";
import { Transactions } from "./screens/Transactions.tsx";
import { Claims } from "./screens/Claims.tsx";
import { Summary } from "./screens/Summary.tsx";
import { Settings } from "./screens/Settings.tsx";
import { ManualEntry } from "./screens/ManualEntry.tsx";
import { TransactionDetail } from "./screens/TransactionDetail.tsx";
import { listPending, listTransactions, seedDefaults } from "./db/repo.ts";
import { SmsReader, smsAvailable } from "./native/sms.ts";
import { ingestSms } from "./lib/ingest.ts";
import { drainCaptured } from "./lib/capture.ts";
import { syncBankSendersToNative } from "./lib/senders.ts";

export default function App() {
  const [tab, setTab] = useState<TabKey>("inbox");
  const [entryOpen, setEntryOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const transactions = useLiveQuery(listTransactions, [], []);
  const pending = useLiveQuery(listPending, [], []);
  const detail = transactions.find((tx) => tx.id === detailId);

  useEffect(() => void seedDefaults(), []);

  // Live capture while the app is running; the manifest receiver covers the rest.
  useEffect(() => {
    if (!smsAvailable) return;
    const handle = SmsReader.addListener(
      "smsReceived",
      (sms) => void ingestSms(sms, { keepUnparsed: true }),
    );
    return () => void handle.then((listener) => listener.remove());
  }, []);

  // Whatever the background receiver queued is ingested on startup, and a tapped
  // capture notification opens its transaction directly (PRD 4.3). Categorization
  // always happens here, in the app — never from the notification shade.
  useEffect(() => {
    if (!smsAvailable) return;

    async function drain() {
      const openId = await drainCaptured();
      if (!openId) return;
      setEntryOpen(false);
      setDetailId(openId);
    }

    void syncBankSendersToNative().then(drain);
    const handle = SmsReader.addListener("captureTapped", () => void drain());
    return () => void handle.then((listener) => listener.remove());
  }, []);

  // Switching tabs always leaves the detail sheet.
  function changeTab(next: TabKey) {
    setDetailId(null);
    setEntryOpen(false);
    setTab(next);
  }

  if (detail) {
    return (
      <AppShell active={tab} onChange={changeTab} pendingCount={pending.length}>
        <TransactionDetail tx={detail} onClose={() => setDetailId(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell active={tab} onChange={changeTab} pendingCount={pending.length}>
      {entryOpen ? (
        <ManualEntry onDone={() => setEntryOpen(false)} />
      ) : (
        <div className="relative h-full">
          {tab === "inbox" && <Inbox pending={pending} onOpen={setDetailId} />}
          {tab === "transactions" && (
            <Transactions transactions={transactions} onOpen={setDetailId} />
          )}
          {tab === "claims" && <Claims />}
          {tab === "summary" && <Summary transactions={transactions} />}
          {tab === "settings" && <Settings />}
          {tab !== "settings" && (
            <button
              type="button"
              onClick={() => setEntryOpen(true)}
              className="fixed bottom-20 left-4 grid size-14 place-items-center rounded-full bg-[var(--color-brand)] text-white shadow-lg"
              aria-label="ثبت تراکنش"
            >
              <Plus size={26} />
            </button>
          )}
        </div>
      )}
    </AppShell>
  );
}
