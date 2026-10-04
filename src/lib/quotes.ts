import "server-only";
import type { Currency } from "./rebalance";

// Prices come from TMX Money's quote API, which covers both TSX and US listings,
// with Yahoo Finance as a fallback. The USD/CAD rate comes from the Bank of
// Canada's daily rate, falling back to Yahoo. None of these need an API key.

export interface Listing {
  symbol: string;
  currency: Currency;
}

export interface Quote {
  price: number;
  name: string | null;
  source: string;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string };

export interface FxRate {
  rate: number;
  source: string;
  asOf: Date;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8000;

function describe(listing: Listing) {
  return `${listing.symbol} (${listing.currency === "CAD" ? "TSX" : "US"})`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.name === "TimeoutError" ? "timed out" : error.message;
  }
  return String(error);
}

async function getJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** TMX wants TSX tickers as-is ("XIC", "DLR.U") and US tickers suffixed ("AVUV:US"). */
function tmxSymbol({ symbol, currency }: Listing) {
  return currency === "USD" ? `${symbol}:US` : symbol;
}

/** Yahoo wants "XIC.TO" for the TSX and dashes for share classes ("BRK-B"). */
function yahooSymbol({ symbol, currency }: Listing) {
  const base = symbol.replace(/\./g, "-");
  return currency === "CAD" ? `${base}.TO` : base;
}

interface TmxQuote {
  name: string | null;
  price: number | null;
  currency: string | null;
}

/** One GraphQL request for every listing; unknown symbols come back as null. */
async function fetchTmx(listings: Listing[]): Promise<(TmxQuote | null)[]> {
  const params = listings.map((_, i) => `$s${i}: String`).join(", ");
  const fields = listings
    .map((_, i) => `q${i}: getQuoteBySymbol(symbol: $s${i}, locale: "en") { name price currency }`)
    .join("\n");
  const variables = Object.fromEntries(listings.map((l, i) => [`s${i}`, tmxSymbol(l)]));
  const json = await getJson("https://app-money.tmx.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://money.tmx.com",
      Referer: "https://money.tmx.com/",
    },
    body: JSON.stringify({ query: `query Quotes(${params}) {\n${fields}\n}`, variables }),
  });
  if (!json?.data) throw new Error(json?.errors?.[0]?.message ?? "unexpected response");
  return listings.map((_, i) => json.data[`q${i}`] ?? null);
}

interface YahooQuote {
  price: number;
  currency: string | null;
  name: string | null;
  time: Date | null;
}

async function fetchYahoo(symbol: string): Promise<YahooQuote | null> {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
  );
  const meta = json?.chart?.result?.[0]?.meta;
  if (typeof meta?.regularMarketPrice !== "number") return null;
  return {
    price: meta.regularMarketPrice,
    currency: meta.currency ?? null,
    name: meta.longName ?? meta.shortName ?? null,
    time: typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000) : null,
  };
}

function checkQuote(
  listing: Listing,
  source: string,
  q: { price: number | null; currency: string | null; name: string | null } | null,
): QuoteResult | null {
  if (!q || typeof q.price !== "number" || !(q.price > 0)) return null;
  if (q.currency && q.currency !== listing.currency) {
    return {
      ok: false,
      error: `${listing.symbol} trades in ${q.currency} there, not ${listing.currency}.`,
    };
  }
  return { ok: true, quote: { price: q.price, name: q.name, source } };
}

export async function fetchQuotes(listings: Listing[]): Promise<QuoteResult[]> {
  if (listings.length === 0) return [];

  let tmx: (TmxQuote | null)[] = listings.map(() => null);
  let tmxError: string | null = null;
  try {
    tmx = await fetchTmx(listings);
  } catch (error) {
    tmxError = errorMessage(error);
  }

  return Promise.all(
    listings.map(async (listing, i): Promise<QuoteResult> => {
      const fromTmx = checkQuote(listing, "TMX", tmx[i]);
      if (fromTmx) return fromTmx;

      let yahooError: string | null = null;
      try {
        const fromYahoo = checkQuote(listing, "Yahoo", await fetchYahoo(yahooSymbol(listing)));
        if (fromYahoo) return fromYahoo;
      } catch (error) {
        yahooError = errorMessage(error);
      }

      // A clean "no such symbol" from either source is a lookup miss, not an outage.
      if (!tmxError || !yahooError) {
        return { ok: false, error: `Couldn't find ${describe(listing)}. Check the ticker and currency.` };
      }
      return {
        ok: false,
        error: `Couldn't get a price for ${describe(listing)} (TMX ${tmxError}, Yahoo ${yahooError}).`,
      };
    }),
  );
}

async function fetchBankOfCanada(): Promise<FxRate> {
  const json = await getJson(
    "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1",
  );
  const observation = json?.observations?.[0];
  const rate = Number(observation?.FXUSDCAD?.v);
  if (!(rate > 0) || typeof observation?.d !== "string") throw new Error("no rate in response");
  // A daily rate: keep the date, at midday UTC so it shows as that date in any North American time zone.
  return { rate, source: "Bank of Canada", asOf: new Date(`${observation.d}T12:00:00Z`) };
}

export async function fetchUsdCad(): Promise<FxRate> {
  try {
    return await fetchBankOfCanada();
  } catch (bocError) {
    try {
      const q = await fetchYahoo("USDCAD=X");
      if (q) return { rate: q.price, source: "Yahoo Finance", asOf: q.time ?? new Date() };
      throw new Error("no rate in response");
    } catch (yahooError) {
      throw new Error(
        `Couldn't get the USD/CAD rate (Bank of Canada ${errorMessage(bocError)}, Yahoo ${errorMessage(yahooError)}).`,
      );
    }
  }
}
