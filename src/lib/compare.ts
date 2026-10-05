// Comparing the portfolio at two moments: two snapshots, or a snapshot and the
// holdings on screen now. Values come from `analyze`, so a snapshot's total is
// the one the holdings table showed when it was saved.

import { analyze, type Currency } from "./rebalance";
import type { AssetData, PortfolioData } from "./types";

/** What a comparison reads from a snapshot or the live portfolio. */
export type Holdings = Pick<PortfolioData, "cashCad" | "cashUsd" | "targetCashCad" | "targetCashUsd" | "usdCad"> & {
  assets: Pick<AssetData, "symbol" | "name" | "currency" | "targetPercent" | "units" | "price">[];
};

/** A fund or cash balance at one moment. */
export interface Position {
  /** Units held, or for cash the amount in its own currency. */
  units: number;
  /** In the fund's own currency; null for cash, or when the price hadn't loaded. */
  price: number | null;
  /** In CAD, null when the price or exchange rate is unknown. */
  value: number | null;
  /** Percent of total value. */
  weight: number | null;
}

/** Later minus earlier; null when either side is unknown. */
export interface Change {
  units: number | null;
  /** Percent change in price. */
  price: number | null;
  value: number | null;
  /** In percentage points. */
  weight: number | null;
}

export interface FundComparison {
  symbol: string;
  name: string;
  currency: Currency;
  /** Null when the fund wasn't in the portfolio at that moment. */
  from: Position | null;
  to: Position | null;
  change: Change;
}

export interface CashComparison {
  currency: Currency;
  from: Position;
  to: Position;
  change: Change;
}

export interface Comparison {
  funds: FundComparison[];
  cash: CashComparison[];
  total: { from: number | null; to: number | null; change: number | null; percent: number | null };
  usdCad: { from: number | null; to: number | null };
}

function valuation(h: Holdings) {
  const analysis = analyze({
    holdings: h.assets.map(({ symbol, currency, targetPercent, units, price }, id) => ({
      id,
      symbol,
      currency,
      targetPercent,
      units,
      price,
    })),
    cash: { CAD: h.cashCad, USD: h.cashUsd },
    keepCash: { CAD: h.targetCashCad, USD: h.targetCashUsd },
    usdCad: h.usdCad,
    allowSells: true,
  });
  const { holdings, cash, totalValue } = analysis;
  return {
    funds: h.assets.map(({ symbol, name, currency, units, price }, i) => ({
      symbol,
      name,
      currency,
      position: { units, price, value: holdings[i].value, weight: holdings[i].weight } satisfies Position,
    })),
    cash: cash.map(({ currency, amount, value, weight }) => ({
      currency,
      position: { units: amount, price: null, value, weight } satisfies Position,
    })),
    total: totalValue,
  };
}

/** Total value in CAD, or null while a price or the exchange rate is unknown. */
export function totalValue(h: Holdings): number | null {
  return valuation(h).total;
}

function changeBetween(from: Position | null, to: Position | null): Change {
  // A fund that isn't held at one moment counts as zero there.
  const diff = (field: "units" | "value" | "weight") => {
    const before = from ? from[field] : 0;
    const after = to ? to[field] : 0;
    return before === null || after === null ? null : after - before;
  };
  const priceBefore = from?.price ?? null;
  const priceAfter = to?.price ?? null;
  return {
    units: diff("units"),
    price: priceBefore && priceAfter ? (priceAfter / priceBefore - 1) * 100 : null,
    value: diff("value"),
    weight: diff("weight"),
  };
}

const fundKey = (f: { symbol: string; currency: Currency }) => `${f.symbol}:${f.currency}`;

/** How the portfolio changed from `from` to `to`, fund by fund. */
export function compare(from: Holdings, to: Holdings): Comparison {
  const before = valuation(from);
  const after = valuation(to);
  const beforeByKey = new Map(before.funds.map((f) => [fundKey(f), f]));
  const afterByKey = new Map(after.funds.map((f) => [fundKey(f), f]));

  // Funds in their later order, then any that were removed in between.
  const keys = new Set([...afterByKey.keys(), ...beforeByKey.keys()]);
  const funds = [...keys].map((key): FundComparison => {
    const earlier = beforeByKey.get(key);
    const later = afterByKey.get(key);
    const { symbol, name, currency } = (later ?? earlier)!;
    const fromPosition = earlier?.position ?? null;
    const toPosition = later?.position ?? null;
    return { symbol, name, currency, from: fromPosition, to: toPosition, change: changeBetween(fromPosition, toPosition) };
  });

  const cash = before.cash.map(({ currency, position }, i): CashComparison => {
    const toPosition = after.cash[i].position;
    return { currency, from: position, to: toPosition, change: changeBetween(position, toPosition) };
  });

  const change = before.total !== null && after.total !== null ? after.total - before.total : null;
  return {
    funds,
    cash,
    total: {
      from: before.total,
      to: after.total,
      change,
      percent: change !== null && before.total !== null && before.total > 0 ? (change / before.total) * 100 : null,
    },
    usdCad: { from: from.usdCad, to: to.usdCad },
  };
}
