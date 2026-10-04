import type { Currency } from "./rebalance";

const moneyFormats: Record<Currency, Intl.NumberFormat> = {
  // en-CA writes CAD as "$1,234.50" and USD as "US$1,234.50".
  CAD: new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }),
  USD: new Intl.NumberFormat("en-CA", { style: "currency", currency: "USD" }),
};

export function money(amount: number, currency: Currency = "CAD") {
  return moneyFormats[currency].format(amount);
}

export function percent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

/** Percentage points with an explicit sign; "0.0" when it rounds to zero. */
export function points(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

const unitFormat = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 4 });

export function units(value: number) {
  return unitFormat.format(value);
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" });

export function shortDate(iso: string) {
  return dateFormat.format(new Date(iso));
}

/** "2:05 p.m." today, otherwise "Oct 2, 2:05 p.m." */
export function timestamp(iso: string, now = new Date()) {
  const date = new Date(iso);
  const time = timeFormat.format(date);
  return date.toDateString() === now.toDateString() ? time : `${dateFormat.format(date)}, ${time}`;
}
