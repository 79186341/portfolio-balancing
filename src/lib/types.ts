import type { Currency } from "./rebalance";

// Plain, serializable shapes passed from the server to the browser.

export interface AssetData {
  id: number;
  symbol: string;
  name: string;
  currency: Currency;
  targetPercent: number;
  units: number;
  price: number | null;
  priceSource: string | null;
  priceAsOf: string | null;
}

export interface PortfolioData {
  id: number;
  cashCad: number;
  cashUsd: number;
  targetCashCad: number;
  targetCashUsd: number;
  allowSells: boolean;
  usdCad: number | null;
  usdCadSource: string | null;
  usdCadAsOf: string | null;
  pricesAsOf: string | null;
  assets: AssetData[];
}

export type PortfolioPatch = Partial<
  Pick<PortfolioData, "cashCad" | "cashUsd" | "targetCashCad" | "targetCashUsd" | "allowSells">
>;

export type AssetPatch = Partial<Pick<AssetData, "units" | "targetPercent">>;

export interface PriceRefresh {
  prices: Pick<AssetData, "id" | "price" | "priceSource" | "priceAsOf">[];
  usdCad: Pick<PortfolioData, "usdCad" | "usdCadSource" | "usdCadAsOf">;
  pricesAsOf: string | null;
  errors: string[];
}
