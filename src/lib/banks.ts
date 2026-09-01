/**
 * Bank profiles: the per-bank half of SMS parsing.
 *
 * A profile is only a vocabulary — how this bank words a withdrawal, a deposit,
 * an amount. It deliberately says nothing about who sent the message: senders are
 * phone numbers that differ per user and change over time, and which numbers the
 * app may read is a permission question (the approved-sender list), not a parsing
 * one. Every profile is tried against every message; the text decides.
 *
 * Adding a bank is a profile here plus its real messages in the parser fixtures.
 */

export interface BankProfile {
  key: string;
  title: string;
  /** Words that mean money left the account. */
  out: string[];
  /** Words that mean money arrived. */
  in: string[];
  /** Amount patterns, tried in order. Group 1 = digits, group 2 = unit when present. */
  amount: RegExp[];
  /** Balance patterns, tried in order. Group 1 = digits. */
  balance: RegExp[];
}

/** Wording common enough that no bank has to repeat it. */
export const GENERIC: BankProfile = {
  key: "generic",
  title: "عمومی",
  out: ["برداشت", "خرید", "پرداخت", "بدهکار", "کاهش", "کسر", "انتقال از"],
  in: ["واریز", "بستانکار", "افزایش", "دریافت", "انتقال به"],
  amount: [
    // "60,000,000 ریال از حساب شما پرید"
    /([\d,٬]{3,})\s*(ریال|تومان|تومن)/,
    // "برداشت: ۲۵۰,۰۰۰"
    /(?:مبلغ|برداشت|واریز|خرید|پرداخت|انتقال|بدهکار|بستانکار)\D{0,12}?([\d,٬]{3,})/,
  ],
  balance: [/(?:مانده|موجودی)\D{0,12}?([\d,٬]{3,})/],
};

const BLU: BankProfile = {
  key: "blu",
  title: "بلو",
  // Blu writes in slang: money "flies off" the account or "settles into" it.
  out: ["پرید"],
  in: ["نشست"],
  amount: [],
  balance: [],
};

/**
 * Post Bank states the amount on its own line, signed, with no label — and puts
 * the card number right after the word "برداشت", where a generic pattern would
 * happily read 1327 as five hundred thousand Rial. Its own pattern runs first.
 */
const POST: BankProfile = {
  key: "postbank",
  title: "پست بانک",
  out: [],
  in: [],
  // "-509,000" alone on a line. The sign is the amount's, not the direction's:
  // direction still comes from the wording, as everywhere else.
  amount: [/(?:^|\n)\s*[-+\u2212]([\d,\u066c]{3,})\s*(?:\n|$)/],
  balance: [],
};

export const BANKS: BankProfile[] = [BLU, POST];

/**
 * Everything the parser knows, bank wording first so a bank can shadow a generic
 * pattern. One profile for every message — the sender is not consulted.
 */
export const ALL: BankProfile = {
  key: "all",
  title: "همه",
  out: [...BANKS.flatMap((bank) => bank.out), ...GENERIC.out],
  in: [...BANKS.flatMap((bank) => bank.in), ...GENERIC.in],
  amount: [...BANKS.flatMap((bank) => bank.amount), ...GENERIC.amount],
  balance: [...BANKS.flatMap((bank) => bank.balance), ...GENERIC.balance],
};

/**
 * Which bank's own wording this message used, for display and for spotting format
 * drift. `generic` means it parsed on shared patterns alone — which is a fine
 * outcome, not a failure.
 */
export function bankKeyOf(text: string): string {
  const bank = BANKS.find(
    (profile) =>
      profile.out.some((word) => text.includes(word)) ||
      profile.in.some((word) => text.includes(word)) ||
      profile.amount.some((pattern) => pattern.test(text)),
  );
  return bank?.key ?? "generic";
}
