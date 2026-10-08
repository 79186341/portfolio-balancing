import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_ASSETS } from "./defaults";
import { prisma } from "./prisma";
import type { Currency } from "./rebalance";
import type { AccountData, AssetData, PortfolioData } from "./types";

// Each account, like a TFSA or RRSP, is one Portfolio row with its own funds,
// cash and snapshots.

const accountFields = { id: true, name: true } satisfies Prisma.PortfolioSelect;

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
    allowConversion: p.allowConversion,
    allowFractional: p.allowFractional,
    usdCad: p.usdCad,
    usdCadSource: p.usdCadSource,
    usdCadAsOf: p.usdCadAsOf?.toISOString() ?? null,
    pricesAsOf: p.pricesAsOf?.toISOString() ?? null,
    assets: p.assets.map(toAssetData),
  };
}

/** The accounts in the order they were added. The first is created with the default funds on first use. */
export async function getAccounts(): Promise<AccountData[]> {
  const existing = await prisma.portfolio.findMany({ orderBy: { id: "asc" }, select: accountFields });
  if (existing.length > 0) return existing;

  return prisma.$transaction(async (tx) => {
    const raced = await tx.portfolio.findMany({ orderBy: { id: "asc" }, select: accountFields });
    if (raced.length > 0) return raced;
    const created = await tx.portfolio.create({
      data: { assets: { create: DEFAULT_ASSETS.map((asset, position) => ({ ...asset, position })) } },
      select: accountFields,
    });
    return [created];
  });
}

/** An account's holdings, cash and last prices, or null if there's no such account. */
export async function getPortfolio(accountId: number): Promise<PortfolioData | null> {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: accountId }, include: withAssets });
  return portfolio && toPortfolioData(portfolio);
}

/**
 * Adds an account. With `copyFrom`, it starts with that account's funds, targets
 * and last prices, but no units or cash.
 */
export async function createAccount(name: string, copyFrom: PortfolioData | null): Promise<AccountData> {
  return prisma.portfolio.create({
    data: {
      name,
      ...(copyFrom && {
        usdCad: copyFrom.usdCad,
        usdCadSource: copyFrom.usdCadSource,
        usdCadAsOf: copyFrom.usdCadAsOf,
        pricesAsOf: copyFrom.pricesAsOf,
        assets: {
          create: copyFrom.assets.map(
            ({ symbol, name, currency, targetPercent, price, priceSource, priceAsOf }, position) => ({
              symbol,
              name,
              currency,
              targetPercent,
              price,
              priceSource,
              priceAsOf,
              position,
            }),
          ),
        },
      }),
    },
    select: accountFields,
  });
}
