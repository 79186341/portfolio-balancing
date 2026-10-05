import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import type { Currency } from "./rebalance";
import type { PortfolioData, SnapshotData } from "./types";

const withAssets = {
  assets: { orderBy: { position: "asc" } },
} satisfies Prisma.SnapshotInclude;

type SnapshotRow = Prisma.SnapshotGetPayload<{ include: typeof withAssets }>;

function toSnapshotData(s: SnapshotRow): SnapshotData {
  return {
    id: s.id,
    label: s.label,
    createdAt: s.createdAt.toISOString(),
    cashCad: s.cashCad,
    cashUsd: s.cashUsd,
    targetCashCad: s.targetCashCad,
    targetCashUsd: s.targetCashUsd,
    usdCad: s.usdCad,
    pricesAsOf: s.pricesAsOf?.toISOString() ?? null,
    assets: s.assets.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      currency: a.currency as Currency,
      targetPercent: a.targetPercent,
      units: a.units,
      price: a.price,
    })),
  };
}

/** The portfolio's snapshots, newest first. */
export async function getSnapshots(portfolioId: number): Promise<SnapshotData[]> {
  const rows = await prisma.snapshot.findMany({
    where: { portfolioId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: withAssets,
  });
  return rows.map(toSnapshotData);
}

/** Copies the portfolio's holdings, cash and last prices into a new snapshot. */
export async function createSnapshot(portfolio: PortfolioData, label: string): Promise<SnapshotData> {
  const created = await prisma.snapshot.create({
    data: {
      portfolioId: portfolio.id,
      label,
      cashCad: portfolio.cashCad,
      cashUsd: portfolio.cashUsd,
      targetCashCad: portfolio.targetCashCad,
      targetCashUsd: portfolio.targetCashUsd,
      usdCad: portfolio.usdCad,
      pricesAsOf: portfolio.pricesAsOf,
      assets: {
        create: portfolio.assets.map(({ symbol, name, currency, targetPercent, units, price }, position) => ({
          symbol,
          name,
          currency,
          targetPercent,
          units,
          price,
          position,
        })),
      },
    },
    include: withAssets,
  });
  return toSnapshotData(created);
}
