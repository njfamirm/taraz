import { expect, test } from "vite-plus/test";
import { parseSms, type RawSms } from "./sms.ts";

const RECEIVED_AT = Date.UTC(2024, 7, 2, 10, 0);

function sms(body: string, sender = "bank"): RawSms {
  return { id: "1", sender, body, receivedAt: RECEIVED_AT };
}

// ── Blu ────────────────────────────────────────────────────────────────────
// Real messages. Blu states the amount with no label and words the direction as
// "پرید" / "نشست"; the account balance follows on its own line.

function blu(body: string): RawSms {
  return sms(body, "blu");
}

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

test("reads a bank's wording even from a sender we do not know", () => {
  expect(parseSms(sms("2,500,000 ریال از حساب شما پرید"))).toMatchObject({
    amount: 2_500_000,
    direction: "out",
  });
});

test("ignores messages that are not about money moving", () => {
  expect(parseSms(sms("سلام، جلسه فردا ساعت 10:30 برگزار می‌شود."))).toBeNull();
  expect(parseSms(sms("رمز پویا: 12345678"))).toBeNull();
});
