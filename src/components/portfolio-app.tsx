"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { addAsset, refreshPrices, removeAsset, updateAsset, updatePortfolio } from "@/app/actions";
import { shortDate, timestamp } from "@/lib/format";
import { analyze, type Currency } from "@/lib/rebalance";
import type { AssetData, AssetPatch, PortfolioData, PortfolioPatch, PriceRefresh } from "@/lib/types";
import { AddFundForm } from "./add-fund-form";
import { HoldingsTable } from "./holdings-table";
import { TradesPanel } from "./trades-panel";
import { useAutosave, type SaveState } from "./use-autosave";

const STALE_AFTER_MS = 15 * 60 * 1000;

function needsRefresh(p: PortfolioData) {
  if (!p.pricesAsOf || p.usdCad === null || p.assets.some((a) => a.price === null)) return true;
  return Date.now() - new Date(p.pricesAsOf).getTime() > STALE_AFTER_MS;
}

function mergePrices(p: PortfolioData, refresh: PriceRefresh): PortfolioData {
  const byId = new Map(refresh.prices.map((price) => [price.id, price]));
  return {
    ...p,
    ...refresh.usdCad,
    pricesAsOf: refresh.pricesAsOf,
    assets: p.assets.map((a) => ({ ...a, ...byId.get(a.id) })),
  };
}

// Times are formatted in the browser's time zone, so only render them after hydration.
const subscribeNoop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function PortfolioApp({ initial }: { initial: PortfolioData }) {
  const [portfolio, setPortfolio] = useState(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [refreshing, startRefresh] = useTransition();
  const autosave = useAutosave();
  const hydrated = useHydrated();

  const analysis = useMemo(
    () =>
      analyze({
        holdings: portfolio.assets.map(({ id, symbol, currency, targetPercent, units, price }) => ({
          id,
          symbol,
          currency,
          targetPercent,
          units,
          price,
        })),
        cash: { CAD: portfolio.cashCad, USD: portfolio.cashUsd },
        keepCash: { CAD: portfolio.targetCashCad, USD: portfolio.targetCashUsd },
        usdCad: portfolio.usdCad,
        allowSells: portfolio.allowSells,
      }),
    [portfolio],
  );

  const refresh = useCallback(() => {
    startRefresh(async () => {
      try {
        const result = await refreshPrices();
        setPortfolio((p) => mergePrices(p, result));
        setProblems(result.errors);
      } catch {
        setProblems(["Couldn't reach the app's server to refresh prices. Is it still running?"]);
      }
    });
  }, []);

  // Fetch prices on open if they're missing or more than 15 minutes old.
  const checkedOnOpen = useRef(false);
  useEffect(() => {
    if (checkedOnOpen.current) return;
    checkedOnOpen.current = true;
    if (needsRefresh(initial)) refresh();
  }, [initial, refresh]);

  const changeAsset = (id: number, patch: AssetPatch) => {
    setPortfolio((p) => ({ ...p, assets: p.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    autosave.schedule(`asset:${id}`, patch, (merged) => updateAsset(id, merged));
  };

  const changePortfolio = (patch: PortfolioPatch) => {
    setPortfolio((p) => ({ ...p, ...patch }));
    autosave.schedule("portfolio", patch, updatePortfolio);
  };

  const add = async (input: { symbol: string; currency: Currency; targetPercent: number }) => {
    const result = await addAsset(input);
    if (result.ok) setPortfolio((p) => ({ ...p, assets: [...p.assets, result.asset] }));
    return result;
  };

  const remove = async (asset: AssetData) => {
    if (!window.confirm(`Remove ${asset.symbol} and its holdings from the portfolio?`)) return;
    autosave.cancel(`asset:${asset.id}`);
    setPortfolio((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== asset.id) }));
    try {
      await removeAsset(asset.id);
    } catch {
      setProblems([`Couldn't remove ${asset.symbol}. Reload the page to see what was saved.`]);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pb-16 pt-6 sm:px-6 sm:pt-10 xl:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-b border-rule-strong pb-6">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
          Portfolio rebalancer
        </h1>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[13px]">
            <dt className="text-ink-3">USD/CAD</dt>
            <dd className="tabular-nums text-ink">
              {portfolio.usdCad !== null ? portfolio.usdCad.toFixed(4) : "—"}
              {hydrated && portfolio.usdCadAsOf && (
                <span className="text-ink-3">
                  {" "}
                  {portfolio.usdCadSource}, {shortDate(portfolio.usdCadAsOf)}
                </span>
              )}
            </dd>
            <dt className="text-ink-3">Prices</dt>
            <dd className="text-ink">
              {refreshing ? "Updating…" : hydrated && portfolio.pricesAsOf ? `Updated ${timestamp(portfolio.pricesAsOf)}` : "Not loaded yet"}
            </dd>
          </dl>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-[4px] bg-accent px-3.5 py-2 text-[15px] font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
          >
            <svg
              viewBox="0 0 16 16"
              width="15"
              height="15"
              aria-hidden
              className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
            >
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh prices"}
          </button>
        </div>
      </header>

      {problems.length > 0 && (
        <div role="alert" className="mt-4 rounded-[4px] border border-sell/40 px-4 py-3 text-[13px] text-sell">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}

      <div className="mt-8 grid items-start gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="holdings-heading" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="holdings-heading" className="text-xl font-semibold tracking-tight">
              Holdings
            </h2>
            <SaveStatus state={autosave.state} />
          </div>
          <HoldingsTable
            portfolio={portfolio}
            analysis={analysis}
            onAssetChange={changeAsset}
            onPortfolioChange={changePortfolio}
            onCommit={autosave.flush}
            onRemove={remove}
          />
          <div className="mt-4">
            <AddFundForm unallocated={100 - analysis.targetSum} onAdd={add} />
          </div>
        </section>

        <div className="xl:sticky xl:top-8">
          <TradesPanel
            analysis={analysis}
            allowSells={portfolio.allowSells}
            onAllowSellsChange={(allowSells) => changePortfolio({ allowSells })}
            rateSource={portfolio.usdCadSource}
          />
        </div>
      </div>
    </main>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const text = {
    saved: "All changes saved",
    saving: "Saving…",
    error: "Couldn't save your last change. Is the app's server running?",
  }[state];
  return (
    <p aria-live="polite" className={`text-[13px] ${state === "error" ? "text-sell" : "text-ink-3"}`}>
      {text}
    </p>
  );
}
