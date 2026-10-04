import type { Currency } from "./rebalance";

/** The portfolio a fresh database starts with. Edit it in the app. */
export const DEFAULT_ASSETS: {
  symbol: string;
  name: string;
  currency: Currency;
  targetPercent: number;
}[] = [
  { symbol: "XIC", name: "iShares Core S&P/TSX Capped Composite ETF", currency: "CAD", targetPercent: 30 },
  { symbol: "VUN", name: "Vanguard US Total Market ETF", currency: "CAD", targetPercent: 30 },
  { symbol: "AVUV", name: "Avantis U.S. Small Cap Value ETF", currency: "USD", targetPercent: 10 },
  { symbol: "XEF", name: "iShares Core MSCI EAFE IMI Index ETF", currency: "CAD", targetPercent: 16 },
  { symbol: "AVDV", name: "Avantis International Small Cap Value ETF", currency: "USD", targetPercent: 6 },
  { symbol: "XEC", name: "iShares Core MSCI Emerging Markets IMI Index ETF", currency: "CAD", targetPercent: 8 },
];
