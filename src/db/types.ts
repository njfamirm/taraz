export type Direction = "in" | "out";
export type TxSource = "sms" | "manual" | "import";
export type TxStatus = "pending" | "categorized" | "ignored";

export interface Transaction {
  id: string;
  amount: number; // integer Rial, always positive
  direction: Direction;
  occurredAt: number;
  balanceAfter: number | null;
  accountId: string | null;
  counterparty: string | null;
  rawText: string | null;
  rawSender: string | null;
  source: TxSource;
  status: TxStatus;
  projectId: string | null;
  tagIds: string[];
  note: string | null;
  splitId: string | null;
  parseConfidence: number;
  matchedRuleId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Account {
  id: string;
  title: string;
  bankKey: string;
  last4: string | null;
  color: string;
  archived: boolean;
}

export type ProjectKind = "personal" | "client" | "other";

export interface Project {
  id: string;
  title: string;
  color: string;
  kind: ProjectKind;
  defaultReimbursable: boolean;
  archived: boolean;
}

export interface Tag {
  id: string;
  title: string;
  color: string;
  archived: boolean;
}

export type PersonKind = "person" | "company";

export interface Person {
  id: string;
  name: string;
  color: string;
  kind: PersonKind;
}

export type SplitMode = "full-claim" | "equal" | "percent" | "exact";

export interface Share {
  personId: string | null; // null = me
  amount: number; // integer Rial
  settledAt: number | null;
  settlementNote: string | null;
}

export interface Split {
  id: string;
  transactionId: string;
  mode: SplitMode;
  shares: Share[];
}

export interface ParseRule {
  id: string;
  title: string;
  bankKey: string;
  senderPatterns: string[];
  pattern: string;
  unit: "rial" | "toman";
  directionHint: Direction | "auto";
  enabled: boolean;
  priority: number;
}

export interface Condition {
  kind: "textContains" | "amountBetween" | "timeOfDay" | "dayOfWeek" | "account" | "direction";
  keywords?: string[];
  min?: number;
  max?: number;
  from?: string;
  to?: string;
  days?: number[];
  accountId?: string;
  direction?: Direction;
}

export interface CategoryRule {
  id: string;
  title: string;
  enabled: boolean;
  priority: number;
  conditions: Condition[];
  actions: {
    projectId?: string;
    tagIds?: string[];
    /** A split needs a counterparty, so `splitMode` only applies with `personId`. */
    splitMode?: SplitMode;
    personId?: string;
    note?: string;
  };
}

export interface Setting {
  key: string;
  value: unknown;
}
