import { expect, test } from "vite-plus/test";
import { parseSms, type RawSms } from "./sms.ts";

const RECEIVED_AT = Date.UTC(2024, 7, 2, 10, 0);

function sms(body: string): RawSms {
  return { id: "1", sender: "bank", body, receivedAt: RECEIVED_AT };
}

test("parses a withdrawal with Persian digits and a Jalali stamp", () => {
  const parsed = parseSms(
    sms("بلو\nبرداشت: ۲۵۰,۰۰۰ ریال\nبابت: اسنپ\nمانده: ۴,۱۲۰,۰۰۰\n۱۴۰۳/۰۵/۱۲ - ۱۴:۲۲"),
  );
  expect(parsed).toMatchObject({
    amount: 250_000,
    direction: "out",
    balanceAfter: 4_120_000,
    counterparty: "اسنپ",
    confidence: 0.9,
  });
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

test("ignores non-bank messages", () => {
  expect(parseSms(sms("سلام دوست عزیز، فردا میبینمت"))).toBeNull();
});
