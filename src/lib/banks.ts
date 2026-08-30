/**
 * Bank profiles: the per-bank half of SMS parsing.
 *
 * Adding a bank means adding a profile here plus its real messages to the test
 * fixtures — no changes to the parser itself. Every profile inherits the generic
 * patterns, so a profile only carries what its bank words differently.
 */

export interface BankProfile {
  key: string;
  title: string;
  /** Sender ids as the device reports them. Matched loosely, case-insensitively. */
  senders: string[];
  /** Words that mean money left the account. */
  out: string[];
  /** Words that mean money arrived. */
  in: string[];
  /** Amount patterns, tried in order. Group 1 = digits, group 2 = unit when present. */
  amount: RegExp[];
  /** Balance patterns, tried in order. Group 1 = digits. */
  balance: RegExp[];
}

/**
 * The fallback every profile is merged with. Bank-specific patterns run first, so
 * a profile can always override without deleting anything.
 */
export const GENERIC: BankProfile = {
  key: "generic",
  title: "عمومی",
  senders: [],
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
  senders: ["blu", "بلو", "blubank"],
  // Blu writes in slang: money "flies off" the account or "settles into" it.
  out: ["پرید"],
  in: ["نشست"],
  amount: [],
  balance: [],
};

export const BANKS: BankProfile[] = [BLU];

function looseMatch(candidate: string, sender: string): boolean {
  const a = candidate.toLowerCase();
  const b = sender.toLowerCase();
  if (b.includes(a)) return true;
  // Operators prefix short codes inconsistently (+98, 0, 9810…), so compare tails.
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  return da !== "" && db !== "" && (da.endsWith(db) || db.endsWith(da));
}

/** The profile for a sender, already merged with the generic fallback. */
export function profileFor(sender: string): BankProfile {
  const bank = BANKS.find((profile) =>
    profile.senders.some((candidate) => looseMatch(candidate, sender)),
  );
  if (!bank) return GENERIC;
  return {
    ...bank,
    out: [...bank.out, ...GENERIC.out],
    in: [...bank.in, ...GENERIC.in],
    amount: [...bank.amount, ...GENERIC.amount],
    balance: [...bank.balance, ...GENERIC.balance],
  };
}

/**
 * A bank's own wording can appear in a message from an unknown sender (forwarded,
 * a short code we have not seen). Used only to widen direction detection.
 */
export function allDirectionWords(): { out: string[]; in: string[] } {
  return {
    out: [...GENERIC.out, ...BANKS.flatMap((bank) => bank.out)],
    in: [...GENERIC.in, ...BANKS.flatMap((bank) => bank.in)],
  };
}
