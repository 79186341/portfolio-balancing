import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_ASSETS } from "./defaults";
import { prisma } from "./prisma";
import type { Currency } from "./rebalance";
import type { AssetData, PortfolioData } from "./types";

const withAssets = {
  assets: { orderBy: [{ position: "asc" }, { id: "asc" }] },
} satisfies Prisma.PortfolioInclude;

type PortfolioRow = Prisma.PortfolioGetPayload<{ include: typeof withAssets }>;
type AssetRow = PortfolioRow["assets"][number];

export function toAssetData(a: AssetRow): AssetData {
  return {
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    currency: a.currency as Currency,
    targetPercent: a.targetPercent,
    units: a.units,
    price: a.price,
    priceSource: a.priceSource,
    priceAsOf: a.priceAsOf?.toISOString() ?? null,
  };
}

function toPortfolioData(p: PortfolioRow): PortfolioData {
  return {
    id: p.id,
    cashCad: p.cashCad,
    cashUsd: p.cashUsd,
    targetCashCad: p.targetCashCad,
    targetCashUsd: p.targetCashUsd,
    allowSells: p.allowSells,
    usdCad: p.usdCad,
    usdCadSource: p.usdCadSource,
    usdCadAsOf: p.usdCadAsOf?.toISOString() ?? null,
    pricesAsOf: p.pricesAsOf?.toISOString() ?? null,
    assets: p.assets.map(toAssetData),
  };
}

/** The app's one portfolio, created with the default funds on first use. */
export async function getPortfolio(): Promise<PortfolioData> {
  const existing = await prisma.portfolio.findFirst({ orderBy: { id: "asc" }, include: withAssets });
  if (existing) return toPortfolioData(existing);

  const created = await prisma.$transaction(async (tx) => {
    const raced = await tx.portfolio.findFirst({ orderBy: { id: "asc" }, include: withAssets });
    if (raced) return raced;
    return tx.portfolio.create({
      data: { assets: { create: DEFAULT_ASSETS.map((asset, position) => ({ ...asset, position })) } },
      include: withAssets,
    });
  });
  return toPortfolioData(created);
}
