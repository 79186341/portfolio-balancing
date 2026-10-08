// Pure rebalancing math, shared by the server and the browser.
//
// Everything is valued in CAD. Target percentages apply to the money you want
// invested: total value minus the cash you've chosen to keep.
//
// With whole shares, the plan starts as close to the targets as whole shares
// allow without overspending, then buys one share at a time while that brings
// the portfolio (cash included) closer to target. With fractional shares, it
// sells down to target and spends what that frees up, to 0.0001 of a share.
//
// Without currency conversion, each currency's cash only buys the funds listed
// in it, so each currency is balanced on its own, as if it were the whole
// portfolio: its funds' targets are scaled to add up to what it has to invest.

export type Currency = "CAD" | "USD";

export const CURRENCIES: readonly Currency[] = ["CAD", "USD"];

export interface HoldingInput {
  id: number;
  symbol: string;
  currency: Currency;
  /** Share of the invested portfolio, 0–100. */
  targetPercent: number;
  units: number;
  /** Last price in the holding's own currency. */
  price: number | null;
}

export interface RebalanceInput {
  holdings: HoldingInput[];
  cash: Record<Currency, number>;
  /** Cash to leave uninvested, per currency. */
  keepCash: Record<Currency, number>;
  /** CAD per 1 USD. */
  usdCad: number | null;
  /** When false, only buy with spare cash. */
  allowSells: boolean;
  /** When false, each currency's cash only buys funds listed in that currency. */
  allowConversion: boolean;
  /** When true, trades can be fractions of a share. */
  allowFractional: boolean;
}

export interface HoldingRow {
  id: number;
  symbol: string;
  currency: Currency;
  units: number;
  /** Market value in CAD, null while the price (or FX rate) is unknown. */
  value: number | null;
  /** Percent of total portfolio value. */
  weight: number | null;
  /** Target as a percent of total portfolio value (differs from targetPercent when keeping cash). */
  target: number | null;
  /** weight − target, in percentage points. */
  drift: number | null;
}

export interface CashRow {
  currency: Currency;
  amount: number;
  keep: number;
  value: number | null;
  weight: number | null;
  target: number | null;
  drift: number | null;
}

export interface Trade {
  id: number;
  symbol: string;
  currency: Currency;
  /** Positive to buy, negative to sell. */
  units: number;
  /** In the holding's currency: positive is spent, negative is received. */
  amount: number;
  weightBefore: number;
  weightAfter: number;
}

export interface Conversion {
  from: Currency;
  to: Currency;
  amountFrom: number;
  amountTo: number;
  rate: number;
}

export interface Plan {
  trades: Trade[];
  conversion: Conversion | null;
  /** Units per holding id after the trades. */
  unitsAfter: Record<number, number>;
  weightAfter: Record<number, number>;
  cashAfter: Record<Currency, number>;
  cashWeightAfter: Record<Currency, number>;
  /** Largest |weight − target| among holdings and cash, after the trades. */
  maxDriftAfter: number;
}

export interface Analysis {
  totalValue: number | null;
  holdings: HoldingRow[];
  cash: CashRow[];
  targetSum: number;
  /** Largest |weight − target| among holdings and cash, right now. */
  maxDrift: number | null;
  /** Why no plan could be made. Empty when `plan` is set. */
  issues: string[];
  plan: Plan | null;
}

const EPS = 1e-9;
const TARGET_SUM_TOLERANCE = 0.001;
/** Fractional trades are in steps of 0.0001 of a share. */
const SHARE_STEPS = 10_000;
/** Fractional trades worth less than this, in the fund's own currency, are left out. */
const MIN_FRACTIONAL_TRADE = 1;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
// The nudges stop float error (3.4521 × 10,000 = 34520.99…) from costing a step.
const sharesDown = (units: number) => Math.floor(units * SHARE_STEPS + 1e-6) / SHARE_STEPS;
const sharesUp = (units: number) => Math.ceil(units * SHARE_STEPS - 1e-6) / SHARE_STEPS;

export function analyze(input: RebalanceInput): Analysis {
  const { holdings, cash, keepCash, usdCad, allowSells, allowConversion, allowFractional } = input;
  const fx = usdCad != null && usdCad > 0 ? usdCad : null;
  const toCad = (currency: Currency) => (currency === "CAD" ? 1 : fx);

  const issues: string[] = [];
  const targetSum = sum(holdings.map((h) => h.targetPercent));

  if (holdings.length === 0) {
    issues.push("Add a fund to get started.");
  } else if (Math.abs(targetSum - 100) > TARGET_SUM_TOLERANCE) {
    issues.push(`Targets add up to ${+targetSum.toFixed(3)}%. Adjust them so they total 100%.`);
  }
  const usesUsd =
    holdings.some((h) => h.currency === "USD") || cash.USD !== 0 || keepCash.USD !== 0;
  if (usesUsd && fx == null) {
    issues.push("The USD/CAD exchange rate hasn't loaded yet.");
  }
  const unpriced = holdings.filter((h) => !(h.price != null && h.price > 0));
  if (unpriced.length > 0) {
    issues.push(`No price yet for ${unpriced.map((h) => h.symbol).join(", ")}.`);
  }

  // CAD price per share, or null when unknown.
  const cadPrices = holdings.map((h) => {
    const rate = toCad(h.currency);
    return h.price != null && h.price > 0 && rate != null ? h.price * rate : null;
  });
  const values = holdings.map((h, i) => (cadPrices[i] == null ? null : h.units * cadPrices[i]!));
  const cashValue = (c: Currency, amount: number) => {
    const rate = toCad(c);
    return amount === 0 ? 0 : rate == null ? null : amount * rate;
  };

  const knownTotal = [...values, ...CURRENCIES.map((c) => cashValue(c, cash[c]))];
  const totalValue = knownTotal.every((v) => v != null) ? sum(knownTotal as number[]) : null;
  const keepValues = CURRENCIES.map((c) => cashValue(c, keepCash[c]));
  const keepTotal = keepValues.every((v) => v != null) ? sum(keepValues as number[]) : null;
  const investable = totalValue != null && keepTotal != null ? totalValue - keepTotal : null;

  if (totalValue != null && totalValue <= 0 && holdings.length > 0) {
    issues.push("Enter your holdings or cash to see a plan.");
  } else if (investable != null && investable < 0) {
    issues.push("The cash you want to keep is more than the whole portfolio is worth.");
  }

  const percentOfTotal = (v: number | null) =>
    v == null || totalValue == null || totalValue <= 0 ? null : (v / totalValue) * 100;
  const drift = (weight: number | null, target: number | null) =>
    weight == null || target == null ? null : weight - target;

  const holdingRows: HoldingRow[] = holdings.map((h, i) => {
    const weight = percentOfTotal(values[i]);
    const target = investable == null ? null : percentOfTotal((investable * h.targetPercent) / 100);
    return {
      id: h.id,
      symbol: h.symbol,
      currency: h.currency,
      units: h.units,
      value: values[i],
      weight,
      target,
      drift: drift(weight, target),
    };
  });

  const cashRows: CashRow[] = CURRENCIES.map((c) => {
    const value = cashValue(c, cash[c]);
    const weight = percentOfTotal(value);
    const target = percentOfTotal(cashValue(c, keepCash[c]));
    return {
      currency: c,
      amount: cash[c],
      keep: keepCash[c],
      value,
      weight,
      target,
      drift: drift(weight, target),
    };
  });

  const drifts = [...holdingRows, ...cashRows].map((r) => r.drift);
  const maxDrift = drifts.every((d) => d != null)
    ? Math.max(0, ...drifts.map((d) => Math.abs(d!)))
    : null;

  const base = { totalValue, holdings: holdingRows, cash: cashRows, targetSum, maxDrift };
  if (issues.length > 0 || totalValue == null || investable == null) {
    return { ...base, issues, plan: null };
  }

  const prices = cadPrices as number[];
  const plan = buildPlan({
    holdings,
    prices,
    investable,
    totalValue,
    cash,
    keepCash,
    usdCad: fx ?? 1,
    allowSells,
    allowConversion,
    allowFractional,
    weightsBefore: holdingRows.map((r) => r.weight!),
    targets: holdingRows.map((r) => r.target!),
    cashTargets: cashRows.map((r) => r.target!),
  });
  return { ...base, issues, plan };
}

interface PlanInput {
  holdings: HoldingInput[];
  prices: number[];
  investable: number;
  totalValue: number;
  cash: Record<Currency, number>;
  keepCash: Record<Currency, number>;
  usdCad: number;
  allowSells: boolean;
  allowConversion: boolean;
  allowFractional: boolean;
  weightsBefore: number[];
  targets: number[];
  cashTargets: number[];
}

/** Funds that trade from the same cash, and how much of it there is to spend (CAD). */
interface Pool {
  /** Indexes into the holdings. */
  members: number[];
  spare: number;
}

function buildPlan(p: PlanInput): Plan {
  const { holdings, prices, investable, totalValue, usdCad } = p;
  const ideal = holdings.map((h) => (investable * h.targetPercent) / 100);
  const values = holdings.map((h, i) => h.units * prices[i]);

  // Converting lets any cash buy any fund. Without it, each currency's cash only
  // buys the funds listed in that currency.
  const pools: Pool[] = p.allowConversion
    ? [{ members: holdings.map((_, i) => i), spare: investable - sum(values) }]
    : CURRENCIES.map((c) => ({
        members: holdings.flatMap((h, i) => (h.currency === c ? [i] : [])),
        spare: (p.cash[c] - p.keepCash[c]) * (c === "CAD" ? 1 : usdCad),
      }));

  const trades = holdings.map(() => 0);
  for (const pool of pools) {
    // With one pool the targets already add up to what there is to invest.
    const goals = p.allowConversion ? ideal : scaleGoals(pool, ideal, values);
    const trade = p.allowFractional ? tradeFractions : tradeWholeShares;
    trade(pool, goals, trades, p);
  }

  // Cash in each currency after trading, then the conversion that tops up whichever
  // currency falls short of what you want to keep. Without conversion, each
  // currency's trades were paid for from its own cash.
  const cashAfter: Record<Currency, number> = { ...p.cash };
  holdings.forEach((h, i) => {
    cashAfter[h.currency] -= trades[i] * (h.price as number);
  });
  const surplus = (c: Currency) => cashAfter[c] - p.keepCash[c];
  let conversion: Conversion | null = null;
  if (p.allowConversion) {
    if (surplus("USD") < -EPS && surplus("CAD") > EPS) {
      const usd = Math.min(-surplus("USD"), surplus("CAD") / usdCad);
      conversion = { from: "CAD", to: "USD", amountFrom: usd * usdCad, amountTo: usd, rate: usdCad };
    } else if (surplus("CAD") < -EPS && surplus("USD") > EPS) {
      const cad = Math.min(-surplus("CAD"), surplus("USD") * usdCad);
      conversion = { from: "USD", to: "CAD", amountFrom: cad / usdCad, amountTo: cad, rate: usdCad };
    }
  }
  if (conversion) {
    cashAfter[conversion.from] -= conversion.amountFrom;
    cashAfter[conversion.to] += conversion.amountTo;
  }

  const pct = (v: number) => (totalValue > 0 ? (v / totalValue) * 100 : 0);
  const unitsAfter: Record<number, number> = {};
  const weightAfter: Record<number, number> = {};
  const tradeList: Trade[] = [];
  holdings.forEach((h, i) => {
    const units = h.units + trades[i];
    unitsAfter[h.id] = units;
    weightAfter[h.id] = pct(units * prices[i]);
    if (Math.abs(trades[i]) > EPS) {
      tradeList.push({
        id: h.id,
        symbol: h.symbol,
        currency: h.currency,
        units: trades[i],
        amount: trades[i] * (h.price as number),
        weightBefore: p.weightsBefore[i],
        weightAfter: weightAfter[h.id],
      });
    }
  });
  const cashWeightAfter = {
    CAD: pct(cashAfter.CAD),
    USD: pct(cashAfter.USD * usdCad),
  };
  const maxDriftAfter = Math.max(
    0,
    ...holdings.map((h, i) => Math.abs(weightAfter[h.id] - p.targets[i])),
    ...CURRENCIES.map((c, i) => Math.abs(cashWeightAfter[c] - p.cashTargets[i])),
  );

  return {
    trades: tradeList,
    conversion,
    unitsAfter,
    weightAfter,
    cashAfter,
    cashWeightAfter,
    maxDriftAfter,
  };
}

/**
 * Targets (CAD) for one currency's funds when its cash can't be converted,
 * scaled in proportion until they add up to what the currency has: its funds
 * and its spare cash. That balances the currency as if it were the whole
 * portfolio, keeping its funds in their target proportions to each other.
 */
function scaleGoals(pool: Pool, ideal: number[], values: number[]): number[] {
  const goals = [...ideal];
  const budget = pool.spare + sum(pool.members.map((i) => values[i]));
  const idealSum = sum(pool.members.map((i) => ideal[i]));
  // With nothing to invest or nothing to buy, aim for zero: sell what can be sold.
  const scale = budget > 0 && idealSum > 0 ? budget / idealSum : 0;
  for (const i of pool.members) goals[i] = ideal[i] * scale;
  return goals;
}

/** Whole-share trades for one pool's funds, written into `trades`. */
function tradeWholeShares(pool: Pool, goals: number[], trades: number[], p: PlanInput): void {
  const { holdings, prices } = p;
  const { members } = pool;
  const gap = (i: number) => goals[i] - (holdings[i].units + trades[i]) * prices[i];

  // Starting point: as close to target as whole shares allow without overspending.
  if (p.allowSells) {
    for (const i of members) trades[i] = Math.max(Math.floor(gap(i) / prices[i] + EPS), -holdings[i].units);
  } else {
    const buys = waterFill(members.map(gap), members.map((i) => prices[i]), pool.spare);
    members.forEach((i, k) => {
      trades[i] = buys[k];
    });
  }

  // Then spend what's left one share at a time, picking the purchase that most
  // reduces the squared distance from target (with spare cash counted as off-target).
  let spare = pool.spare - sum(members.map((i) => trades[i] * prices[i]));
  for (;;) {
    let best = -1;
    let bestGain = EPS;
    for (const i of members) {
      if (holdings[i].targetPercent <= 0 || prices[i] > spare + EPS) continue;
      const gain = prices[i] * (spare + gap(i) - prices[i]);
      if (gain > bestGain) {
        best = i;
        bestGain = gain;
      }
    }
    if (best < 0) break;
    trades[best] += 1;
    spare -= prices[best];
  }
}

/**
 * Fractional trades for one pool's funds, written into `trades`: sell what's over
 * target, then spend the spare cash and what the sales raise so the shortfalls
 * even out.
 */
function tradeFractions(pool: Pool, goals: number[], trades: number[], p: PlanInput): void {
  const { holdings, prices } = p;
  const worthTrading = (i: number, units: number) => units * (holdings[i].price as number) >= MIN_FRACTIONAL_TRADE;

  let cash = pool.spare;
  const selling = new Set<number>();
  if (p.allowSells) {
    for (const i of pool.members) {
      const { units } = holdings[i];
      const excess = units * prices[i] - goals[i];
      if (excess <= EPS) continue;
      // Rounded up so the sale raises enough, or the whole holding when none should be left.
      const sell = goals[i] > EPS ? Math.min(units, sharesUp(excess / prices[i])) : units;
      if (!worthTrading(i, sell)) continue;
      trades[i] = -sell;
      cash += sell * prices[i];
      selling.add(i);
    }
  }

  const buyable = pool.members.filter((i) => holdings[i].targetPercent > 0 && !selling.has(i));
  if (cash <= EPS || buyable.length === 0) return;
  const gaps = buyable.map((i) => goals[i] - holdings[i].units * prices[i]);
  const level = waterLevel(gaps, cash);
  buyable.forEach((i, k) => {
    // Rounded down so the purchases never cost more than there is.
    const buy = sharesDown(Math.max(0, gaps[k] - level) / prices[i]);
    if (worthTrading(i, buy)) trades[i] = buy;
  });
}

/**
 * Buy-only starting point: spend `cash` on the holdings furthest below target so
 * their shortfalls even out (classic water-filling), rounded down to whole shares.
 */
function waterFill(gaps: number[], prices: number[], cash: number): number[] {
  const buys = gaps.map(() => 0);
  const under = gaps.filter((g) => g > 0);
  if (cash <= 0 || under.length === 0) return buys;
  // Fill no further than the targets; the one-share-at-a-time pass spends any rest.
  const level = Math.max(waterLevel(under, cash), 0);
  gaps.forEach((g, i) => {
    if (g > level) buys[i] = Math.floor((g - level) / prices[i] + EPS);
  });
  return buys;
}

/** The common level L where sum(max(0, value − L)) = amount, for a positive amount. */
function waterLevel(values: number[], amount: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  let running = 0;
  for (let k = 0; k < sorted.length; k++) {
    running += sorted[k];
    const level = (running - amount) / (k + 1);
    if (level >= (sorted[k + 1] ?? -Infinity)) return level;
  }
  return -Infinity; // only reached with no values
}
