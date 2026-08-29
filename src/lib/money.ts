/** All money is integer Rial. Toman is a render-boundary concept only. */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(input: string): string {
  return input.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

export function tomanToRial(toman: number): number {
  return Math.round(toman * 10);
}

function group(n: number): string {
  return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format an integer Rial amount as Persian-digit Toman, e.g. "۲۵۰,۰۰۰". */
export function formatToman(rial: number, options?: { sign?: boolean; unit?: boolean }): string {
  const toman = rialToToman(rial);
  const sign = options?.sign && toman !== 0 ? (toman < 0 ? "‑" : "+") : "";
  const body = toPersianDigits(group(toman));
  return `${sign}${body}${options?.unit ? " تومان" : ""}`;
}

/** Parse a user-typed Toman amount (Persian/Arabic digits, separators) into integer Rial. */
export function parseTomanInput(input: string): number | null {
  const normalized = toEnglishDigits(input)
    .replace(/[,٬\s]/g, "")
    .trim();
  if (normalized === "" || !/^\d+$/.test(normalized)) return null;
  return tomanToRial(Number(normalized));
}
