import { describe, expect, it } from "vitest";
import { analyze, type Currency, type HoldingInput, type RebalanceInput } from "./rebalance";

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
    allowConversion: true,
    allowFractional: false,
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

/** What the trades in one currency cost, net of sales, in that currency. */
function spentIn(result: ReturnType<typeof analyze>, currency: Currency) {
  return result.plan!.trades.filter((t) => t.currency === currency).reduce((a, t) => a + t.amount, 0);
}

/** Each fund's weight after the plan as a multiple of its target. */
function weightOverTarget(result: ReturnType<typeof analyze>, currency: Currency) {
  return result.holdings
    .filter((h) => h.currency === currency && h.target! > 0)
    .map((h) => result.plan!.weightAfter[h.id] / h.target!);
}

const decimals = (units: number) => (String(units).split(".")[1] ?? "").length;

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

describe("analyze without converting currency", () => {
  const noConversion = { allowConversion: false };
  const overweightXic = holdings({ XIC: 1000, VUN: 100, AVUV: 50, XEF: 200, AVDV: 30, XEC: 100 });

  it("spends each currency's cash only on funds listed in that currency", () => {
    const result = analyze(input({ ...noConversion, cash: { CAD: 50_000, USD: 10_000 } }));
    const plan = result.plan!;
    expect(plan.conversion).toBeNull();
    expect(plan.trades.every((t) => t.units > 0)).toBe(true);
    expect(spentIn(result, "CAD")).toBeLessThanOrEqual(50_000);
    expect(spentIn(result, "USD")).toBeLessThanOrEqual(10_000);
    // What's left in each currency is less than a share of its dearest fund.
    expect(plan.cashAfter.CAD).toBeLessThan(146.42);
    expect(plan.cashAfter.USD).toBeLessThan(120.03);
  });

  it("puts cash into its own currency's funds in proportion to their targets", () => {
    // Only CAD cash: the US-listed funds can't be bought, so the Canadian-listed
    // ones (84% of the targets) get all of it, each at 100/84 of its target.
    const result = analyze(input({ ...noConversion, cash: { CAD: 1_000_000, USD: 0 } }));
    expect(result.plan!.conversion).toBeNull();
    expect(tradesBySymbol(result).AVUV).toBeUndefined();
    expect(tradesBySymbol(result).AVDV).toBeUndefined();
    for (const ratio of weightOverTarget(result, "CAD")) expect(ratio).toBeCloseTo(100 / 84, 2);
    expect(result.plan!.cashAfter.CAD).toBeLessThan(146.42);
  });

  it("rebalances each currency's funds among themselves when it can sell", () => {
    const result = analyze(input({ ...noConversion, holdings: overweightXic }));
    const plan = result.plan!;
    const trades = tradesBySymbol(result);
    expect(plan.conversion).toBeNull();
    expect(trades.XIC).toBeLessThan(0);
    expect(trades.VUN).toBeGreaterThan(0);
    // Sales in each currency pay for that currency's buys.
    expect(plan.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(plan.cashAfter.USD).toBeGreaterThanOrEqual(-1e-6);
    // The Canadian-listed funds end up in proportion to their targets, to within a share.
    const ratios = weightOverTarget(result, "CAD");
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.05);
  });

  it("leaves the funds alone when each currency is already in proportion", () => {
    // After investing only CAD, the Canadian-listed funds are in proportion and
    // there's nothing to buy the US-listed ones with.
    const scaled = analyze(input({ ...noConversion, cash: { CAD: 1_000_000, USD: 0 } })).plan!;
    const units = Object.fromEntries(holdings().map((h) => [h.symbol, scaled.unitsAfter[h.id]])) as Record<string, number>;
    const result = analyze(input({ ...noConversion, holdings: holdings(units), cash: { ...scaled.cashAfter } }));
    expect(result.plan!.trades).toEqual([]);
  });

  it("sells within a currency to keep the cash you ask for in it", () => {
    const result = analyze(
      input({ ...noConversion, holdings: holdings({ XIC: 100, AVUV: 50 }), keepCash: { CAD: 0, USD: 500 } }),
    );
    const plan = result.plan!;
    expect(plan.conversion).toBeNull();
    expect(tradesBySymbol(result).AVUV).toBeLessThan(0);
    expect(plan.cashAfter.USD).toBeGreaterThanOrEqual(500 - 1e-6);
    expect(plan.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
  });

  it("doesn't convert even when a currency falls short of the cash to keep", () => {
    // Nothing US-listed to sell for the US$500 to keep, and plenty of CAD.
    const list: HoldingInput[] = [
      { id: 1, symbol: "XIC", currency: "CAD", targetPercent: 50, units: 100, price: 56.64 },
      { id: 2, symbol: "XEF", currency: "CAD", targetPercent: 50, units: 0, price: 52.06 },
    ];
    for (const allowSells of [true, false]) {
      const result = analyze(
        input({ ...noConversion, allowSells, holdings: list, cash: { CAD: 5_000, USD: 0 }, keepCash: { CAD: 0, USD: 500 } }),
      );
      expect(result.plan!.conversion).toBeNull();
      expect(result.plan!.cashAfter.USD).toBe(0);
    }
  });

  it("sells a fund with a 0% target and spends the proceeds in the same currency", () => {
    const list = holdings({ XIC: 100 });
    list.push({ id: 7, symbol: "ZAG", currency: "CAD", targetPercent: 0, units: 200, price: 13.5 });
    const result = analyze(input({ ...noConversion, holdings: list }));
    const trades = tradesBySymbol(result);
    expect(trades.ZAG).toBe(-200);
    expect(trades.VUN).toBeGreaterThan(0);
    expect(trades.AVUV).toBeUndefined();
    expect(result.plan!.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
  });

  it("can't spend cash with no funds listed in its currency", () => {
    const list: HoldingInput[] = [
      { id: 1, symbol: "XIC", currency: "CAD", targetPercent: 50, units: 10, price: 56.64 },
      { id: 2, symbol: "XEF", currency: "CAD", targetPercent: 50, units: 10, price: 52.06 },
    ];
    for (const allowSells of [true, false]) {
      const result = analyze(input({ ...noConversion, allowSells, holdings: list, cash: { CAD: 0, USD: 1_000 } }));
      expect(result.plan!.trades).toEqual([]);
      expect(result.plan!.cashAfter.USD).toBe(1_000);
    }
  });

  it("never sells in buy-only mode", () => {
    const result = analyze(
      input({ ...noConversion, allowSells: false, holdings: overweightXic, cash: { CAD: 5_000, USD: 2_000 } }),
    );
    const plan = result.plan!;
    expect(plan.trades.every((t) => t.units > 0)).toBe(true);
    expect(plan.conversion).toBeNull();
    expect(plan.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(plan.cashAfter.USD).toBeGreaterThanOrEqual(-1e-6);
    expect(plan.cashAfter.CAD).toBeLessThan(146.42);
    expect(plan.cashAfter.USD).toBeLessThan(120.03);
  });
});

describe("analyze with fractional shares", () => {
  const fractional = { allowFractional: true };
  const overweightXic = holdings({ XIC: 1000.5, VUN: 100, AVUV: 50.25, XEF: 200, AVDV: 30, XEC: 100 });

  /** The plan for an all-cash portfolio, carried out: units after and cash left. */
  function invested(cash: number) {
    const plan = analyze(input({ ...fractional, cash: { CAD: cash, USD: 0 } })).plan!;
    const units = Object.fromEntries(holdings().map((h) => [h.symbol, plan.unitsAfter[h.id]])) as Record<string, number>;
    return { units, cash: { ...plan.cashAfter } };
  }

  it("invests an all-cash portfolio right on target", () => {
    const result = analyze(input({ ...fractional, cash: { CAD: 100_000, USD: 0 } }));
    const plan = result.plan!;
    for (const h of result.holdings) {
      expect(Math.abs(plan.weightAfter[h.id] - h.target!)).toBeLessThan(0.001);
    }
    expect(plan.trades.every((t) => t.units > 0 && decimals(t.units) <= 4)).toBe(true);
    expect(plan.conversion!.amountTo).toBeCloseTo(spentIn(result, "USD"), 6);
    expect(leftoverCad(result)).toBeGreaterThanOrEqual(-1e-6);
    expect(leftoverCad(result)).toBeLessThan(0.1);
  });

  it("makes no trades once the plan has been carried out", () => {
    const { units, cash } = invested(250_000);
    const result = analyze(input({ ...fractional, holdings: holdings(units), cash }));
    expect(result.plan!.trades).toEqual([]);
    expect(result.plan!.conversion).toBeNull();
  });

  it("leaves out trades worth less than a dollar", () => {
    const { units, cash } = invested(250_000);
    const withMore = (cad: number) =>
      analyze(input({ ...fractional, holdings: holdings(units), cash: { ...cash, CAD: cash.CAD + cad } })).plan!;
    expect(withMore(0.5).trades).toEqual([]);
    expect(withMore(50).trades.length).toBeGreaterThan(0);
  });

  it("sells fractions of what's over target to buy what's under", () => {
    const result = analyze(input({ ...fractional, holdings: overweightXic }));
    const plan = result.plan!;
    expect(tradesBySymbol(result).XIC).toBeLessThan(0);
    for (const h of result.holdings) {
      expect(Math.abs(plan.weightAfter[h.id] - h.target!)).toBeLessThan(0.01);
    }
    expect(plan.trades.every((t) => decimals(t.units) <= 4)).toBe(true);
    expect(plan.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(plan.cashAfter.USD).toBeGreaterThanOrEqual(-1e-6);
  });

  it("sells all of a fund with a 0% target, to the last fraction", () => {
    const list = holdings({ XIC: 100 });
    list.push({ id: 7, symbol: "ZAG", currency: "CAD", targetPercent: 0, units: 12.3456789, price: 13.5 });
    const result = analyze(input({ ...fractional, holdings: list, cash: { CAD: 20_000, USD: 0 } }));
    expect(tradesBySymbol(result).ZAG).toBe(-12.3456789);
  });

  it("spends nearly all spare cash in buy-only mode without selling", () => {
    const result = analyze(
      input({ ...fractional, allowSells: false, holdings: overweightXic, cash: { CAD: 5_000, USD: 0 } }),
    );
    const trades = tradesBySymbol(result);
    expect(Object.values(trades).every((u) => u > 0)).toBe(true);
    expect(trades.XIC).toBeUndefined();
    expect(leftoverCad(result)).toBeGreaterThanOrEqual(-1e-6);
    expect(leftoverCad(result)).toBeLessThan(1);
  });

  it("keeps each currency's funds exactly in proportion without converting", () => {
    const result = analyze(input({ ...fractional, allowConversion: false, cash: { CAD: 100_000, USD: 0 } }));
    const ratios = weightOverTarget(result, "CAD");
    expect(result.plan!.conversion).toBeNull();
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.0001);
    expect(result.plan!.cashAfter.CAD).toBeGreaterThanOrEqual(-1e-6);
    expect(result.plan!.cashAfter.CAD).toBeLessThan(0.1);
  });
});
