import { describe, expect, it } from "vitest";
import { compare, totalValue, type Holdings } from "./compare";
import type { Currency } from "./rebalance";

function fund(symbol: string, currency: Currency, units: number, price: number | null, targetPercent = 50) {
  return { symbol, name: `${symbol} ETF`, currency, targetPercent, units, price };
}

function holdings(assets: Holdings["assets"], overrides: Partial<Holdings> = {}): Holdings {
  return { assets, cashCad: 0, cashUsd: 0, targetCashCad: 0, targetCashUsd: 0, usdCad: 1.4, ...overrides };
}

describe("compare", () => {
  const october = holdings([fund("XIC", "CAD", 100, 50), fund("AVUV", "USD", 10, 100)], { cashCad: 1_000 });
  const november = holdings([fund("XIC", "CAD", 120, 55), fund("AVUV", "USD", 10, 110)], {
    cashUsd: 100,
    usdCad: 1.35,
  });

  it("values each moment at its own prices and exchange rate", () => {
    const result = compare(october, november);
    // 100 × 50 + 10 × 100 × 1.4 + 1,000 cash, then 120 × 55 + 10 × 110 × 1.35 + US$100 × 1.35.
    expect(result.total.from).toBeCloseTo(7_400, 6);
    expect(result.total.to).toBeCloseTo(8_220, 6);
    expect(result.total.change).toBeCloseTo(820, 6);
    expect(result.total.percent).toBeCloseTo((820 / 7_400) * 100, 6);
    expect(result.usdCad).toEqual({ from: 1.4, to: 1.35 });
    expect(totalValue(october)).toBeCloseTo(7_400, 6);
  });

  it("reports the change in units, price, value and weight for each fund", () => {
    const [xic, avuv] = compare(october, november).funds;
    expect(xic.symbol).toBe("XIC");
    expect(xic.change.units).toBe(20);
    expect(xic.change.price).toBeCloseTo(10, 6);
    expect(xic.change.value).toBeCloseTo(1_600, 6);
    expect(xic.change.weight).toBeCloseTo((6_600 / 8_220) * 100 - (5_000 / 7_400) * 100, 6);

    expect(avuv.change.units).toBe(0);
    expect(avuv.change.price).toBeCloseTo(10, 6);
    // Same units at a higher price but a weaker US dollar: 1,400 → 1,485.
    expect(avuv.change.value).toBeCloseTo(85, 6);
  });

  it("compares cash in its own currency and valued in CAD", () => {
    const [cad, usd] = compare(october, november).cash;
    expect(cad).toMatchObject({ currency: "CAD", change: { units: -1_000, value: -1_000, price: null } });
    expect(usd.currency).toBe("USD");
    expect(usd.change.units).toBe(100);
    expect(usd.change.value).toBeCloseTo(135, 6);
  });

  it("counts a fund held at only one moment as zero at the other", () => {
    const before = holdings([fund("XIC", "CAD", 100, 50), fund("ZAG", "CAD", 200, 13.5)]);
    const after = holdings([fund("XIC", "CAD", 100, 50), fund("XEF", "CAD", 50, 40), fund("XIC", "USD", 5, 30)]);
    const funds = compare(before, after).funds;

    // Funds in their later order, then the one that was removed.
    expect(funds.map((f) => `${f.symbol} ${f.currency}`)).toEqual(["XIC CAD", "XEF CAD", "XIC USD", "ZAG CAD"]);
    const [, xef, , zag] = funds;
    expect(xef.from).toBeNull();
    expect(xef.change).toMatchObject({ units: 50, value: 2_000, price: null });
    expect(zag.to).toBeNull();
    expect(zag.change).toMatchObject({ units: -200, value: -2_700, price: null });
    expect(zag.change.weight).toBeCloseTo(-zag.from!.weight!, 6);
  });

  it("leaves values unknown while a price is missing, but still compares units", () => {
    const before = holdings([fund("XIC", "CAD", 100, null)]);
    const after = holdings([fund("XIC", "CAD", 110, 50)]);
    const result = compare(before, after);
    expect(result.funds[0].change).toEqual({ units: 10, price: null, value: null, weight: null });
    expect(result.total).toEqual({ from: null, to: 5_500, change: null, percent: null });
  });
});
