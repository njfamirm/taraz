import type { ComponentType, ReactNode } from "react";
import { BarChart3, HandCoins, Inbox, List, Settings } from "lucide-react";

export type TabKey = "inbox" | "transactions" | "claims" | "summary" | "settings";

const TABS: { key: TabKey; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: "inbox", label: "صندوق", Icon: Inbox },
  { key: "transactions", label: "تراکنش‌ها", Icon: List },
  { key: "claims", label: "طلب‌ها", Icon: HandCoins },
  { key: "summary", label: "خلاصه", Icon: BarChart3 },
  { key: "settings", label: "تنظیمات", Icon: Settings },
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
    <div className="mx-auto flex h-full max-w-md flex-col bg-[var(--color-canvas)]">
      <main className="flex-1 overflow-y-auto">{children}</main>

      <nav
        className="grid grid-cols-5 border-t border-[var(--color-line)] bg-[var(--color-surface)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`tap flex flex-col items-center justify-center gap-1 py-2 text-[11px] ${
              active === tab.key
                ? "font-bold text-[var(--color-brand)]"
                : "text-[var(--color-ink-faint)]"
            }`}
          >
            <span className="relative">
              <tab.Icon size={20} />
              {tab.key === "inbox" && pendingCount > 0 && (
                <span className="num absolute -top-1 -left-2 rounded-full bg-[var(--color-danger)] px-1 text-[10px] leading-4 text-white">
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
