import { describe, expect, it } from "vitest";
import { analyze, type HoldingInput, type RebalanceInput } from "./rebalance";

const USD_CAD = 1.4246;

function holdings(units: Partial<Record<string, number>> = {}): HoldingInput[] {
  return [
    { id: 1, symbol: "XIC", currency: "CAD", targetPercent: 30, price: 56.64 },
    { id: 2, symbol: "VUN", currency: "CAD", targetPercent: 30, price: 146.42 },
    { id: 3, symbol: "AVUV", currency: "USD", targetPercent: 10, price: 120.03 },
    { id: 4, symbol: "XEF", currency: "CAD", targetPercent: 16, price: 52.06 },
    { id: 5, symbol: "AVDV", currency: "USD", targetPercent: 6, price: 109.09 },
    { id: 6, symbol: "XEC", currency: "CAD", targetPercent: 8, price: 45.785 },
  ].map((h) => ({ ...h, currency: h.currency as "CAD" | "USD", units: units[h.symbol] ?? 0 }));
}

function input(overrides: Partial<RebalanceInput> = {}): RebalanceInput {
  return {
    holdings: holdings(),
    cash: { CAD: 0, USD: 0 },
    keepCash: { CAD: 0, USD: 0 },
    usdCad: USD_CAD,
    allowSells: true,
    ...overrides,
  };
}

function tradesBySymbol(result: ReturnType<typeof analyze>) {
  return Object.fromEntries(result.plan!.trades.map((t) => [t.symbol, t.units]));
}

/** Total value of cash in CAD after the plan, which should be less than the cheapest share. */
function leftoverCad(result: ReturnType<typeof analyze>, keep = { CAD: 0, USD: 0 }) {
  const after = result.plan!.cashAfter;
  return after.CAD - keep.CAD + (after.USD - keep.USD) * USD_CAD;
}

describe("analyze", () => {
  it("invests an all-cash portfolio and converts CAD for the US-listed funds", () => {
    const result = analyze(input({ cash: { CAD: 100_000, USD: 0 } }));
    expect(result.issues).toEqual([]);
    const plan = result.plan!;

    expect(plan.trades.every((t) => t.units > 0)).toBe(true);
    for (const h of result.holdings) {
      expect(Math.abs(plan.weightAfter[h.id] - h.target!)).toBeLessThan(0.2);
    }
    expect(plan.conversion?.from).toBe("CAD");
    expect(plan.conversion?.to).toBe("USD");
    // The USD bought is exactly what the US-listed buys cost.
    const usdSpent = plan.trades.filter((t) => t.currency === "USD").reduce((a, t) => a + t.amount, 0);
    expect(plan.conversion!.amountTo).toBeCloseTo(usdSpent, 6);
    expect(plan.cashAfter.USD).toBeCloseTo(0, 6);
    expect(plan.cashAfter.CAD).toBeGreaterThanOrEqual(0);
    expect(leftoverCad(result)).toBeLessThan(45.785);
  });

  it("makes no trades when already on target", () => {
    const first = analyze(input({ cash: { CAD: 250_000, USD: 0 } })).plan!;
    const units = Object.fromEntries(
      holdings().map((h) => [h.symbol, first.unitsAfter[h.id]]),
    ) as Record<string, number>;
    const second = analyze(
      input({ holdings: holdings(units), cash: { CAD: first.cashAfter.CAD, USD: first.cashAfter.USD } }),
    );
    expect(second.plan!.trades).toEqual([]);
    expect(second.plan!.conversion).toBeNull();
  });

  it("sells what's overweight to fund what's underweight", () => {
    const result = analyze(
      input({ holdings: holdings({ XIC: 1000, VUN: 100, AVUV: 50, XEF: 200, AVDV: 30, XEC: 100 }) }),
    );
    const trades = tradesBySymbol(result);
    expect(trades.XIC).toBeLessThan(0);
    expect(trades.VUN).toBeGreaterThan(0);
    for (const h of result.holdings) {
      expect(Math.abs(result.plan!.weightAfter[h.id] - h.target!)).toBeLessThan(0.3);
    }
    expect(result.plan!.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(result.plan!.cashAfter.USD).toBeGreaterThanOrEqual(-1e-6);
  });

  it("never sells in buy-only mode and spends new cash on what's furthest below target", () => {
    const result = analyze(
      input({
        holdings: holdings({ XIC: 1000, VUN: 100, AVUV: 50, XEF: 200, AVDV: 30, XEC: 100 }),
        cash: { CAD: 5_000, USD: 0 },
        allowSells: false,
      }),
    );
    const trades = tradesBySymbol(result);
    expect(Object.values(trades).every((u) => u > 0)).toBe(true);
    expect(trades.XIC).toBeUndefined(); // overweight already
    expect(trades.VUN).toBeGreaterThan(0); // furthest below target
    expect(leftoverCad(result)).toBeGreaterThanOrEqual(-1e-6);
    expect(leftoverCad(result)).toBeLessThan(146.42);
  });

  it("keeps the cash you ask for, in each currency", () => {
    const keep = { CAD: 1_000, USD: 500 };
    const result = analyze(input({ cash: { CAD: 60_000, USD: 10_000 }, keepCash: keep }));
    const after = result.plan!.cashAfter;
    expect(after.CAD).toBeGreaterThanOrEqual(keep.CAD - 1e-6);
    expect(after.USD).toBeGreaterThanOrEqual(keep.USD - 1e-6);
    expect(leftoverCad(result, keep)).toBeLessThan(45.785 * 2);
  });

  it("converts USD to CAD when USD cash pays for Canadian-listed funds", () => {
    const result = analyze(input({ cash: { CAD: 0, USD: 50_000 } }));
    expect(result.plan!.conversion?.from).toBe("USD");
    expect(result.plan!.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(result.plan!.cashAfter.USD).toBeGreaterThanOrEqual(-1e-6);
  });

  it("sells a fund with a 0% target and never buys one", () => {
    const list = holdings({ XIC: 100 });
    list.push({ id: 7, symbol: "ZAG", currency: "CAD", targetPercent: 0, units: 200, price: 13.5 });
    const full = analyze(input({ holdings: list, cash: { CAD: 20_000, USD: 0 } }));
    expect(tradesBySymbol(full).ZAG).toBe(-200);

    const buyOnly = analyze(input({ holdings: list, cash: { CAD: 20_000, USD: 0 }, allowSells: false }));
    expect(tradesBySymbol(buyOnly).ZAG).toBeUndefined();
  });

  it("handles large buy-only contributions quickly", () => {
    const started = performance.now();
    const result = analyze(input({ cash: { CAD: 50_000_000, USD: 0 }, allowSells: false }));
    expect(performance.now() - started).toBeLessThan(200);
    for (const h of result.holdings) {
      expect(Math.abs(result.plan!.weightAfter[h.id] - h.target!)).toBeLessThan(0.01);
    }
  });

  it("explains why there's no plan", () => {
    const list = holdings({ XIC: 10 });
    list[0].targetPercent = 25;
    list[2].price = null;
    const result = analyze(input({ holdings: list, usdCad: null }));
    expect(result.plan).toBeNull();
    expect(result.issues).toEqual([
      "Targets add up to 95%. Adjust them so they total 100%.",
      "The USD/CAD exchange rate hasn't loaded yet.",
      "No price yet for AVUV.",
    ]);
    expect(result.holdings[0].value).toBeCloseTo(566.4, 6);
    expect(result.holdings[0].weight).toBeNull(); // total unknown without AVUV's price
  });

  it("reports weights and drift against the whole portfolio", () => {
    const result = analyze(
      input({ holdings: holdings({ XIC: 100 }), cash: { CAD: 5_664, USD: 0 } }),
    );
    expect(result.totalValue).toBeCloseTo(11_328, 6);
    expect(result.holdings[0].weight).toBeCloseTo(50, 6);
    expect(result.holdings[0].drift).toBeCloseTo(20, 6);
    expect(result.cash[0].weight).toBeCloseTo(50, 6);
    expect(result.maxDrift).toBeCloseTo(50, 6);
  });
});
