"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createAccount, getAccounts, getPortfolio, toAssetData } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";
import { fetchQuotes, fetchUsdCad } from "@/lib/quotes";
import { CURRENCIES, type Currency } from "@/lib/rebalance";
import { createSnapshot } from "@/lib/snapshots";
import {
  ACCOUNT_NAME_MAX_LENGTH,
  SNAPSHOT_LABEL_MAX_LENGTH,
  type AssetData,
  type AssetPatch,
  type PortfolioData,
  type PortfolioPatch,
  type PriceRefresh,
  type SnapshotData,
} from "@/lib/types";

// This app has no logins: it's meant to run locally for one person. Put it
// behind authentication before exposing it to a network.
//
// Every change ends with refresh(), which re-renders the page in the same
// response. The holdings on screen are kept in the browser, so they don't
// change, but account names do, and the back button won't bring back an
// account as it was before the change.

const MAX_AMOUNT = 1e12;

function number(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

const accountIdOf = (value: unknown) => number(value, "account", 1, Infinity);

/** The account's holdings. Throws if the account has been deleted. */
async function portfolioOf(accountId: number): Promise<PortfolioData> {
  const portfolio = await getPortfolio(accountIdOf(accountId));
  if (!portfolio) throw new Error("That account doesn't exist. It may have been deleted.");
  return portfolio;
}

/** The text with spacing tidied, or null if it's empty or longer than `maxLength`. */
function tidy(value: unknown, maxLength: number): string | null {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.length > 0 && text.length <= maxLength ? text : null;
}

export async function updatePortfolio(accountId: number, patch: PortfolioPatch): Promise<void> {
  const data: PortfolioPatch = {};
  if (patch.cashCad !== undefined) data.cashCad = number(patch.cashCad, "CAD cash", -MAX_AMOUNT, MAX_AMOUNT);
  if (patch.cashUsd !== undefined) data.cashUsd = number(patch.cashUsd, "USD cash", -MAX_AMOUNT, MAX_AMOUNT);
  if (patch.targetCashCad !== undefined) {
    data.targetCashCad = number(patch.targetCashCad, "CAD cash to keep", 0, MAX_AMOUNT);
  }
  if (patch.targetCashUsd !== undefined) {
    data.targetCashUsd = number(patch.targetCashUsd, "USD cash to keep", 0, MAX_AMOUNT);
  }
  for (const setting of ["allowSells", "allowConversion", "allowFractional"] as const) {
    if (patch[setting] === undefined) continue;
    if (typeof patch[setting] !== "boolean") throw new Error(`Invalid ${setting}`);
    data[setting] = patch[setting];
  }
  // updateMany: a save that lands after the account was deleted is a no-op, not an error.
  await prisma.portfolio.updateMany({ where: { id: accountIdOf(accountId) }, data });
  refresh();
}

export async function updateAsset(accountId: number, assetId: number, patch: AssetPatch): Promise<void> {
  const data: AssetPatch = {};
  if (patch.units !== undefined) data.units = number(patch.units, "units", 0, MAX_AMOUNT);
  if (patch.targetPercent !== undefined) {
    data.targetPercent = number(patch.targetPercent, "target", 0, 100);
  }
  // updateMany: a save that lands after the fund was removed is a no-op, not an error.
  await prisma.asset.updateMany({
    where: { id: number(assetId, "fund", 1, Infinity), portfolioId: accountIdOf(accountId) },
    data,
  });
  refresh();
}

export async function removeAsset(accountId: number, assetId: number): Promise<void> {
  await prisma.asset.deleteMany({
    where: { id: number(assetId, "fund", 1, Infinity), portfolioId: accountIdOf(accountId) },
  });
  refresh();
}

export type AddAssetResult = { ok: true; asset: AssetData } | { ok: false; error: string };

export async function addAsset(
  accountId: number,
  input: { symbol: string; currency: Currency; targetPercent: number },
): Promise<AddAssetResult> {
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

  const portfolio = await portfolioOf(accountId);
  if (portfolio.assets.some((a) => a.symbol === symbol && a.currency === currency)) {
    return { ok: false, error: `${symbol} (${currency}) is already in this account.` };
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
  refresh();
  return { ok: true, asset: toAssetData(asset) };
}

export async function refreshPrices(accountId: number): Promise<PriceRefresh> {
  const portfolio = await portfolioOf(accountId);
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

  const fresh = await portfolioOf(portfolio.id);
  refresh();
  return {
    prices: fresh.assets.map(({ id, price, priceSource, priceAsOf }) => ({ id, price, priceSource, priceAsOf })),
    usdCad: { usdCad: fresh.usdCad, usdCadSource: fresh.usdCadSource, usdCadAsOf: fresh.usdCadAsOf },
    pricesAsOf: fresh.pricesAsOf,
    errors,
  };
}

const LABEL_ERROR = `Give the snapshot a label of up to ${SNAPSHOT_LABEL_MAX_LENGTH} characters.`;

export type SaveSnapshotResult = { ok: true; snapshot: SnapshotData } | { ok: false; error: string };

/** Saves the account's holdings, cash and last prices as they are in the database now. */
export async function saveSnapshot(accountId: number, label: string): Promise<SaveSnapshotResult> {
  const clean = tidy(label, SNAPSHOT_LABEL_MAX_LENGTH);
  if (!clean) return { ok: false, error: LABEL_ERROR };
  const snapshot = await createSnapshot(await portfolioOf(accountId), clean);
  refresh();
  return { ok: true, snapshot };
}

export type RenameSnapshotResult = { ok: true; label: string } | { ok: false; error: string };

export async function renameSnapshot(accountId: number, snapshotId: number, label: string): Promise<RenameSnapshotResult> {
  const clean = tidy(label, SNAPSHOT_LABEL_MAX_LENGTH);
  if (!clean) return { ok: false, error: LABEL_ERROR };
  await prisma.snapshot.updateMany({
    where: { id: number(snapshotId, "snapshot", 1, Infinity), portfolioId: accountIdOf(accountId) },
    data: { label: clean },
  });
  refresh();
  return { ok: true, label: clean };
}

export async function deleteSnapshot(accountId: number, snapshotId: number): Promise<void> {
  await prisma.snapshot.deleteMany({
    where: { id: number(snapshotId, "snapshot", 1, Infinity), portfolioId: accountIdOf(accountId) },
  });
  refresh();
}

type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** The name tidied, as long as it fits and no other account uses it (ignoring case). */
async function accountName(value: unknown, exceptId: number | null): Promise<NameCheck> {
  const name = tidy(value, ACCOUNT_NAME_MAX_LENGTH);
  if (!name) return { ok: false, error: `Give the account a name of up to ${ACCOUNT_NAME_MAX_LENGTH} characters.` };
  const key = name.toLocaleLowerCase("en-CA");
  const accounts = await getAccounts();
  if (accounts.some((a) => a.id !== exceptId && a.name.toLocaleLowerCase("en-CA") === key)) {
    return { ok: false, error: `You already have an account called ${name}.` };
  }
  return { ok: true, name };
}

export type AccountError = { ok: false; error: string };

/**
 * Adds an account and opens it. With `copyFrom`, it starts with that account's
 * funds and targets. Only returns if the name is rejected.
 */
export async function addAccount(input: { name: string; copyFrom: number | null }): Promise<AccountError> {
  const name = await accountName(input.name, null);
  if (!name.ok) return name;
  const copyFrom = input.copyFrom === null ? null : await portfolioOf(input.copyFrom);
  const account = await createAccount(name.name, copyFrom);
  refresh();
  redirect(`/accounts/${account.id}`);
}

export type RenameAccountResult = { ok: true; name: string } | AccountError;

export async function renameAccount(accountId: number, name: string): Promise<RenameAccountResult> {
  const id = accountIdOf(accountId);
  const checked = await accountName(name, id);
  if (!checked.ok) return checked;
  await prisma.portfolio.updateMany({ where: { id }, data: { name: checked.name } });
  refresh();
  return checked;
}

/**
 * Deletes an account with its holdings and snapshots, then opens the first
 * account left. Only returns if it's the last account, which can't be deleted.
 */
export async function deleteAccount(accountId: number): Promise<AccountError> {
  const id = accountIdOf(accountId);
  const others = (await getAccounts()).filter((a) => a.id !== id);
  if (others.length === 0) return { ok: false, error: "You need at least one account, so this one can't be deleted." };
  await prisma.portfolio.deleteMany({ where: { id } });
  refresh();
  // Replace, so going back doesn't land on the deleted account.
  redirect(`/accounts/${others[0].id}`, RedirectType.replace);
}
