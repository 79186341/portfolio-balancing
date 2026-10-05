"use server";

import { getPortfolio, toAssetData } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";
import { fetchQuotes, fetchUsdCad } from "@/lib/quotes";
import { CURRENCIES, type Currency } from "@/lib/rebalance";
import { createSnapshot } from "@/lib/snapshots";
import {
  SNAPSHOT_LABEL_MAX_LENGTH,
  type AssetData,
  type AssetPatch,
  type PortfolioPatch,
  type PriceRefresh,
  type SnapshotData,
} from "@/lib/types";

// This app has no accounts: it's meant to run locally for one person. Put it
// behind authentication before exposing it to a network.

const MAX_AMOUNT = 1e12;

function number(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

export async function updatePortfolio(patch: PortfolioPatch): Promise<void> {
  const data: PortfolioPatch = {};
  if (patch.cashCad !== undefined) data.cashCad = number(patch.cashCad, "CAD cash", -MAX_AMOUNT, MAX_AMOUNT);
  if (patch.cashUsd !== undefined) data.cashUsd = number(patch.cashUsd, "USD cash", -MAX_AMOUNT, MAX_AMOUNT);
  if (patch.targetCashCad !== undefined) {
    data.targetCashCad = number(patch.targetCashCad, "CAD cash to keep", 0, MAX_AMOUNT);
  }
  if (patch.targetCashUsd !== undefined) {
    data.targetCashUsd = number(patch.targetCashUsd, "USD cash to keep", 0, MAX_AMOUNT);
  }
  if (patch.allowSells !== undefined) {
    if (typeof patch.allowSells !== "boolean") throw new Error("Invalid allowSells");
    data.allowSells = patch.allowSells;
  }
  const { id } = await getPortfolio();
  await prisma.portfolio.update({ where: { id }, data });
}

export async function updateAsset(assetId: number, patch: AssetPatch): Promise<void> {
  const data: AssetPatch = {};
  if (patch.units !== undefined) data.units = number(patch.units, "units", 0, MAX_AMOUNT);
  if (patch.targetPercent !== undefined) {
    data.targetPercent = number(patch.targetPercent, "target", 0, 100);
  }
  const { id: portfolioId } = await getPortfolio();
  // updateMany: a save that lands after the fund was removed is a no-op, not an error.
  await prisma.asset.updateMany({ where: { id: number(assetId, "fund", 1, Infinity), portfolioId }, data });
}

export async function removeAsset(assetId: number): Promise<void> {
  const { id: portfolioId } = await getPortfolio();
  await prisma.asset.deleteMany({ where: { id: number(assetId, "fund", 1, Infinity), portfolioId } });
}

export type AddAssetResult = { ok: true; asset: AssetData } | { ok: false; error: string };

export async function addAsset(input: {
  symbol: string;
  currency: Currency;
  targetPercent: number;
}): Promise<AddAssetResult> {
  let symbol = String(input.symbol ?? "").trim().toUpperCase();
  let currency = input.currency;
  // Accept Yahoo-style TSX tickers like "XIC.TO".
  if (symbol.endsWith(".TO")) {
    symbol = symbol.slice(0, -3);
    currency = "CAD";
  }
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) {
    return { ok: false, error: "Enter a ticker, like XIC or AVUV." };
  }
  if (!CURRENCIES.includes(currency)) return { ok: false, error: "Choose CAD or USD." };
  const targetPercent = input.targetPercent;
  if (typeof targetPercent !== "number" || !Number.isFinite(targetPercent) || targetPercent < 0 || targetPercent > 100) {
    return { ok: false, error: "Enter a target between 0 and 100%." };
  }

  const portfolio = await getPortfolio();
  if (portfolio.assets.some((a) => a.symbol === symbol && a.currency === currency)) {
    return { ok: false, error: `${symbol} (${currency}) is already in your portfolio.` };
  }

  const [quote] = await fetchQuotes([{ symbol, currency }]);
  if (!quote.ok) return { ok: false, error: quote.error };

  const { _max } = await prisma.asset.aggregate({
    where: { portfolioId: portfolio.id },
    _max: { position: true },
  });
  const asset = await prisma.asset.create({
    data: {
      portfolioId: portfolio.id,
      symbol,
      currency,
      targetPercent,
      name: quote.quote.name ?? symbol,
      position: (_max.position ?? -1) + 1,
      price: quote.quote.price,
      priceSource: quote.quote.source,
      priceAsOf: new Date(),
    },
  });
  return { ok: true, asset: toAssetData(asset) };
}

export async function refreshPrices(): Promise<PriceRefresh> {
  const portfolio = await getPortfolio();
  const [quotes, fx] = await Promise.all([
    fetchQuotes(portfolio.assets.map(({ symbol, currency }) => ({ symbol, currency }))),
    fetchUsdCad().then(
      (rate) => ({ ok: true as const, rate }),
      (error: Error) => ({ ok: false as const, error: error.message }),
    ),
  ]);

  const now = new Date();
  await prisma.$transaction([
    ...quotes.flatMap((result, i) =>
      result.ok
        ? [
            prisma.asset.update({
              where: { id: portfolio.assets[i].id },
              data: { price: result.quote.price, priceSource: result.quote.source, priceAsOf: now },
            }),
          ]
        : [],
    ),
    prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        ...(fx.ok && { usdCad: fx.rate.rate, usdCadSource: fx.rate.source, usdCadAsOf: fx.rate.asOf }),
        ...(quotes.some((q) => q.ok) && { pricesAsOf: now }),
      },
    }),
  ]);
  const errors = [
    ...quotes.flatMap((result) => (result.ok ? [] : [result.error])),
    ...(fx.ok ? [] : [fx.error]),
  ];

  const fresh = await getPortfolio();
  return {
    prices: fresh.assets.map(({ id, price, priceSource, priceAsOf }) => ({ id, price, priceSource, priceAsOf })),
    usdCad: { usdCad: fresh.usdCad, usdCadSource: fresh.usdCadSource, usdCadAsOf: fresh.usdCadAsOf },
    pricesAsOf: fresh.pricesAsOf,
    errors,
  };
}

const LABEL_ERROR = `Give the snapshot a label of up to ${SNAPSHOT_LABEL_MAX_LENGTH} characters.`;

/** The label with spacing tidied, or null if it's empty or too long. */
function snapshotLabel(value: unknown): string | null {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return label.length > 0 && label.length <= SNAPSHOT_LABEL_MAX_LENGTH ? label : null;
}

export type SaveSnapshotResult = { ok: true; snapshot: SnapshotData } | { ok: false; error: string };

/** Saves the holdings, cash and last prices as they are in the database now. */
export async function saveSnapshot(label: string): Promise<SaveSnapshotResult> {
  const clean = snapshotLabel(label);
  if (!clean) return { ok: false, error: LABEL_ERROR };
  return { ok: true, snapshot: await createSnapshot(await getPortfolio(), clean) };
}

export type RenameSnapshotResult = { ok: true; label: string } | { ok: false; error: string };

export async function renameSnapshot(snapshotId: number, label: string): Promise<RenameSnapshotResult> {
  const clean = snapshotLabel(label);
  if (!clean) return { ok: false, error: LABEL_ERROR };
  const { id: portfolioId } = await getPortfolio();
  await prisma.snapshot.updateMany({
    where: { id: number(snapshotId, "snapshot", 1, Infinity), portfolioId },
    data: { label: clean },
  });
  return { ok: true, label: clean };
}

export async function deleteSnapshot(snapshotId: number): Promise<void> {
  const { id: portfolioId } = await getPortfolio();
  await prisma.snapshot.deleteMany({ where: { id: number(snapshotId, "snapshot", 1, Infinity), portfolioId } });
}
