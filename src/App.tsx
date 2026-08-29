import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell, type TabKey } from "./components/AppShell.tsx";
import { Inbox } from "./screens/Inbox.tsx";
import { Transactions } from "./screens/Transactions.tsx";
import { Summary } from "./screens/Summary.tsx";
import { ManualEntry } from "./screens/ManualEntry.tsx";
import { SmsImport } from "./screens/SmsImport.tsx";
import { listPending, listTransactions } from "./db/repo.ts";
import { SmsReader, smsAvailable } from "./native/sms.ts";
import { ingestSms } from "./lib/ingest.ts";

export default function App() {
  const [tab, setTab] = useState<TabKey>("inbox");
  const [entryOpen, setEntryOpen] = useState(false);

  const transactions = useLiveQuery(listTransactions, [], []);
  const pending = useLiveQuery(listPending, [], []);

  // Live capture while the app is running. Background capture with the WebView
  // dead needs the manifest receiver and comes later.
  useEffect(() => {
    if (!smsAvailable) return;
    const handle = SmsReader.addListener("smsReceived", (sms) => void ingestSms(sms));
    return () => void handle.then((listener) => listener.remove());
  }, []);

  return (
    <AppShell active={tab} onChange={setTab} pendingCount={pending.length}>
      {entryOpen ? (
        <ManualEntry onDone={() => setEntryOpen(false)} />
      ) : (
        <div className="relative h-full">
          {tab === "inbox" && <Inbox pending={pending} />}
          {tab === "transactions" && <Transactions transactions={transactions} />}
          {tab === "summary" && <Summary transactions={transactions} />}
          {tab === "sms" && <SmsImport />}
          <button
            type="button"
            onClick={() => setEntryOpen(true)}
            className="fixed bottom-20 left-4 grid size-14 place-items-center rounded-full bg-[var(--color-brand)] text-white shadow-lg"
            aria-label="ثبت تراکنش"
          >
            <Plus size={26} />
          </button>
        </div>
      )}
    </AppShell>
  );
}
