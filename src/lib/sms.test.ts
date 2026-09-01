import { expect, test } from "vite-plus/test";
import { parseSms, type RawSms } from "./sms.ts";

const RECEIVED_AT = Date.UTC(2024, 7, 2, 10, 0);

function sms(body: string, sender = "+989123334455"): RawSms {
  return { id: "1", sender, body, receivedAt: RECEIVED_AT };
}

// ── Blu ────────────────────────────────────────────────────────────────────
// Real messages. Blu states the amount with no label and words the direction as
// "پرید" / "نشست"; the account balance follows on its own line. The sender is a
// plain phone number, which is exactly why parsing never looks at it.

const blu = sms;

test("blu: withdrawal", () => {
  expect(
    parseSms(
      blu(
        "برداشت پول\nسیدامیرمحمد عزیز، 60,000,000 ریال از حساب شما پرید.\nموجودی: 115,272,713 ریال\n۱۴:۱۴\n۱۴۰۵.۰۶.۰۸",
      ),
    ),
  ).toMatchObject({
    amount: 60_000_000,
    direction: "out",
    balanceAfter: 115_272_713,
    bankKey: "blu",
    confidence: 0.9,
  });
});

test("blu: transfer out", () => {
  expect(
    parseSms(
      blu(
        "انتقال پل\n سیدامیرمحمد عزیز، 30,000,000 ریال از حساب شما پرید.\n موجودی: 140,275,313 ریال\n۱۲:۳۹\n۱۴۰۵.۰۶.۰۷",
      ),
    ),
  ).toMatchObject({ amount: 30_000_000, direction: "out", balanceAfter: 140_275_313 });
});

test("blu: deposit", () => {
  expect(
    parseSms(
      blu(
        "واریز پول\n سیدامیرمحمد عزیز، 20,000,000 ریال به حساب شما نشست.\n موجودی: 127,281,313 ریال\n۱۱:۲۳\n۱۴۰۵.۰۶.۰۷",
      ),
    ),
  ).toMatchObject({ amount: 20_000_000, direction: "in", balanceAfter: 127_281_313 });
});

test("blu: purchase", () => {
  expect(
    parseSms(
      blu(
        "آنلاین شدی\nسیدامیرمحمد عزیز، 4,218,500 ریال بابت خرید بسته اینترنت از حساب شما پرید .\nموجودی: 69,074,323 ریال\n۱۰:۱۵\n۱۴۰۵.۰۵.۳۱",
      ),
    ),
  ).toMatchObject({ amount: 4_218_500, direction: "out", balanceAfter: 69_074_323 });
});

test("blu: the balance line never becomes the amount", () => {
  const parsed = parseSms(
    blu("سیدامیرمحمد عزیز، 60,000,000 ریال از حساب شما پرید.\nموجودی: 115,272,713 ریال"),
  );
  expect(parsed?.amount).toBe(60_000_000);
});

// ── Generic ────────────────────────────────────────────────────────────────

test("parses a labelled withdrawal with Persian digits and a Jalali stamp", () => {
  expect(parseSms(sms("برداشت: ۲۵۰,۰۰۰ ریال\nمانده: ۴,۱۲۰,۰۰۰\n۱۴۰۳/۰۵/۱۲ - ۱۴:۲۲"))).toMatchObject(
    { amount: 250_000, direction: "out", balanceAfter: 4_120_000, confidence: 0.9 },
  );
});

test("parses a deposit and the card tail", () => {
  expect(
    parseSms(sms("حساب:****1234\nواریز مبلغ 5,000,000 ریال\nموجودی: 12,300,000")),
  ).toMatchObject({ amount: 5_000_000, direction: "in", cardLast4: "1234" });
});

test("converts Toman-quoted amounts to Rial", () => {
  expect(parseSms(sms("خرید مبلغ 120,000 تومان"))?.amount).toBe(1_200_000);
});

test("falls back to receipt time when the message has no date", () => {
  expect(parseSms(sms("خرید مبلغ 1,200,000 ریال کارت 4455"))).toMatchObject({
    occurredAt: RECEIVED_AT,
    confidence: 0.7,
  });
});

test("the sender never affects the parse", () => {
  const body = "سیدامیرمحمد عزیز، 2,500,000 ریال از حساب شما پرید.\nموجودی: 1,000,000 ریال";
  const fromShortCode = parseSms(sms(body, "1000"));
  const fromNumber = parseSms(sms(body, "+989350001122"));
  expect(fromShortCode).toEqual(fromNumber);
  expect(fromNumber).toMatchObject({ amount: 2_500_000, direction: "out", bankKey: "blu" });
});

test("ignores messages that are not about money moving", () => {
  expect(parseSms(sms("سلام، جلسه فردا ساعت 10:30 برگزار می‌شود."))).toBeNull();
  expect(parseSms(sms("رمز پویا: 12345678"))).toBeNull();
});

// ── Keshavarzi (bki) ───────────────────────────────────────────────────────
// Real message. No spaces after the labels, and a compact `yyMMdd-HH:mm` stamp.
// Nothing in it names the bank, so it parses on the shared patterns — which is a
// fine outcome, not a failure.

test("keshavarzi: unspaced labels and a compact stamp", () => {
  expect(parseSms(sms("برداشت500,000\nمانده3,009,474\n050609-12:44\nکارت1148*\nbki. ir"))).toEqual({
    amount: 500_000,
    direction: "out",
    balanceAfter: 3_009_474,
    cardLast4: "1148",
    occurredAt: new Date(2026, 7, 31, 12, 44).getTime(), // 1405/06/09
    bankKey: "generic",
    confidence: 0.9,
  });
});

// ── Post Bank ──────────────────────────────────────────────────────────────
// Real message. The amount is signed, alone on its own line, and the card number
// sits right where a labelled pattern would read it as the amount.

test("postbank: the signed line is the amount, not the card number", () => {
  expect(
    parseSms(
      sms("پست بانک\n برداشت از کارت: 1327\n-509,000\n1405/06/9\n20:15\nمانده: 9,016,510 ريال"),
    ),
  ).toMatchObject({
    amount: 509_000,
    direction: "out",
    balanceAfter: 9_016_510,
    cardLast4: "1327",
    bankKey: "postbank",
    confidence: 0.9,
  });
});

test("postbank: a deposit reads the same way", () => {
  expect(
    parseSms(
      sms("پست بانک\n واریز به کارت: 1327\n+2,500,000\n1405/06/9\n20:15\nمانده: 11,516,510 ريال"),
    ),
  ).toMatchObject({ amount: 2_500_000, direction: "in", balanceAfter: 11_516_510 });
});

test("a bare line of digits is not an amount", () => {
  expect(parseSms(sms("کد پیگیری\n123456789\nبرداشت 750,000 ریال"))).toMatchObject({
    amount: 750_000,
  });
});
