import type { ComponentType, ReactNode } from "react";
import { BarChart3, Inbox, List } from "lucide-react";

export type TabKey = "inbox" | "transactions" | "summary";

const TABS: { key: TabKey; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: "inbox", label: "صندوق", Icon: Inbox },
  { key: "transactions", label: "تراکنش‌ها", Icon: List },
  { key: "summary", label: "خلاصه", Icon: BarChart3 },
];

export function AppShell({
  active,
  onChange,
  pendingCount,
  children,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  pendingCount: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-white dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-lg font-bold">تراز</h1>
        <span className="text-xs text-neutral-500">حسابداری شخصی</span>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>

      <nav className="grid grid-cols-3 border-t border-neutral-200 dark:border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex flex-col items-center gap-1 py-2 text-xs ${
              active === tab.key ? "text-[var(--color-brand)] font-bold" : "text-neutral-500"
            }`}
          >
            <span className="relative">
              <tab.Icon size={20} />
              {tab.key === "inbox" && pendingCount > 0 && (
                <span className="absolute -top-1 -left-2 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                  {pendingCount}
                </span>
              )}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
