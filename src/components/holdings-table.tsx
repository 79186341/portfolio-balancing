"use client";

import { money, percent, points, units } from "@/lib/format";
import type { Analysis, Currency } from "@/lib/rebalance";
import type { AssetData, AssetPatch, PortfolioData, PortfolioPatch } from "@/lib/types";
import { NumberInput } from "./number-input";
import { WeightBar } from "./weight-bar";

interface HoldingsTableProps {
  portfolio: PortfolioData;
  analysis: Analysis;
  onAssetChange: (id: number, patch: AssetPatch) => void;
  onPortfolioChange: (patch: PortfolioPatch) => void;
  /** Save now instead of waiting for the debounce. */
  onCommit: (key: string) => void;
  onRemove: (asset: AssetData) => void;
}

const cashFields: Record<Currency, { amount: "cashCad" | "cashUsd"; keep: "targetCashCad" | "targetCashUsd" }> = {
  CAD: { amount: "cashCad", keep: "targetCashCad" },
  USD: { amount: "cashUsd", keep: "targetCashUsd" },
};

const moneyInput = (value: number) =>
  value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentInput = (value: number) => String(Number(value.toFixed(2)));
const dash = <span className="text-ink-3">—</span>;

// On narrow screens the table scrolls sideways under a pinned first column.
const firstColumn = "sticky left-0 z-10 bg-paper pr-3 text-left align-middle sm:static";
const cell = "px-3";

function CurrencyTag({ currency }: { currency: Currency }) {
  return (
    <span
      title={currency === "CAD" ? "Canadian dollars, listed on the TSX" : "US dollars, listed in the US"}
      className="rounded-[3px] border border-rule-strong px-1 text-[11px] font-medium leading-4 text-ink-2"
    >
      {currency}
    </span>
  );
}

export function HoldingsTable({
  portfolio,
  analysis,
  onAssetChange,
  onPortfolioChange,
  onCommit,
  onRemove,
}: HoldingsTableProps) {
  const rows = [...analysis.holdings, ...analysis.cash];
  const scale = Math.max(10, ...rows.flatMap((r) => [r.weight ?? 0, r.target ?? 0])) * 1.1;
  const targetsOff = Math.abs(analysis.targetSum - 100) > 0.001;
  const keepingCash = portfolio.targetCashCad > 0 || portfolio.targetCashUsd > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-[15px]">
        <caption className="sr-only">
          Holdings, cash, and targets. Weights are a share of the whole portfolio, valued in CAD.
        </caption>
        <thead>
          <tr className="border-b border-rule-strong text-[13px] text-ink-3">
            <th scope="col" className={`${firstColumn} py-2 font-medium`}>Fund</th>
            <th scope="col" className={`${cell} py-2 text-right font-medium`}>Units</th>
            <th scope="col" className={`${cell} py-2 text-right font-medium`}>Value (CAD)</th>
            <th scope="col" className={`${cell} py-2 text-left font-medium`}>Weight</th>
            <th scope="col" className={`${cell} py-2 text-right font-medium`}>Target</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Drift</th>
            <th scope="col" className="w-9 py-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {portfolio.assets.map((asset, i) => {
            const row = analysis.holdings[i];
            return (
              <tr key={asset.id} className="border-b border-rule">
                <th scope="row" className={`${firstColumn} py-2.5 font-normal`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{asset.symbol}</span>
                    <CurrencyTag currency={asset.currency} />
                  </div>
                  <div className="mt-0.5 hidden max-w-[12rem] truncate text-[13px] text-ink-3 sm:block" title={asset.name}>
                    {asset.name}
                  </div>
                </th>
                <td className={`${cell} py-2.5 text-right`}>
                  <NumberInput
                    value={asset.units}
                    format={units}
                    label={`${asset.symbol} units held`}
                    onChange={(value) => onAssetChange(asset.id, { units: value })}
                    onCommit={() => onCommit(`asset:${asset.id}`)}
                    className="w-20"
                  />
                  <div
                    className="mt-0.5 text-[12px] tabular-nums text-ink-3"
                    title={asset.priceSource ? `Price from ${asset.priceSource}` : undefined}
                  >
                    {asset.price !== null ? `at ${money(asset.price, asset.currency)}` : "no price yet"}
                  </div>
                </td>
                <td className={`${cell} py-2.5 text-right tabular-nums`}>
                  {row.value !== null ? money(row.value) : dash}
                </td>
                <td className={`${cell} py-2.5`}>
                  <WeightCell weight={row.weight} target={row.target} scale={scale} />
                </td>
                <td className={`${cell} py-2.5 text-right`}>
                  <NumberInput
                    value={asset.targetPercent}
                    format={percentInput}
                    max={100}
                    suffix="%"
                    label={`${asset.symbol} target percent`}
                    onChange={(value) => onAssetChange(asset.id, { targetPercent: value })}
                    onCommit={() => onCommit(`asset:${asset.id}`)}
                    className="w-[5.5rem]"
                  />
                </td>
                <DriftCell drift={row.drift} />
                <td className="py-2.5 pl-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(asset)}
                    aria-label={`Remove ${asset.symbol}`}
                    title={`Remove ${asset.symbol}`}
                    className="rounded-[3px] p-1.5 text-ink-3 hover:text-sell focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="block">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}

          {analysis.cash.map((row, i) => {
            const fields = cashFields[row.currency];
            const prefix = row.currency === "USD" ? "US$" : "$";
            return (
              <tr key={row.currency} className={`border-b border-rule ${i === 0 ? "border-t border-t-rule-strong" : ""}`}>
                <th scope="row" className={`${firstColumn} py-2.5 font-normal`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">Cash</span>
                    <CurrencyTag currency={row.currency} />
                  </div>
                  <div className="mt-0.5 hidden text-[13px] text-ink-3 sm:block">Target is an amount to keep</div>
                </th>
                <td className={`${cell} py-2.5 text-right`}>
                  <NumberInput
                    value={row.amount}
                    format={moneyInput}
                    min={-1e12}
                    prefix={prefix}
                    label={`${row.currency} cash`}
                    onChange={(value) => onPortfolioChange({ [fields.amount]: value })}
                    onCommit={() => onCommit("portfolio")}
                    className="w-[7.5rem]"
                  />
                </td>
                <td className={`${cell} py-2.5 text-right tabular-nums`}>
                  {row.value !== null ? money(row.value) : dash}
                </td>
                <td className={`${cell} py-2.5`}>
                  <WeightCell weight={row.weight} target={row.target} scale={scale} />
                </td>
                <td className={`${cell} py-2.5 text-right`}>
                  <NumberInput
                    value={row.keep}
                    format={moneyInput}
                    prefix={prefix}
                    label={`${row.currency} cash to keep`}
                    onChange={(value) => onPortfolioChange({ [fields.keep]: value })}
                    onCommit={() => onCommit("portfolio")}
                    className="w-24"
                  />
                </td>
                <DriftCell drift={row.drift} />
                <td />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-b-[3px] border-double border-ink">
            <th scope="row" className={`${firstColumn} py-3 font-semibold`}>Total</th>
            <td className={cell} />
            <td className={`${cell} py-3 text-right font-semibold tabular-nums`}>
              {analysis.totalValue !== null ? money(analysis.totalValue) : dash}
            </td>
            <td className={`${cell} py-3 tabular-nums text-ink-2`}>
              {analysis.totalValue !== null && analysis.totalValue > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0" />
                  <span className="w-12 text-right">100.0%</span>
                </div>
              )}
            </td>
            <td className={`${cell} py-3 text-right tabular-nums ${targetsOff ? "font-semibold text-sell" : "text-ink-2"}`}>
              {/* Lines the % up with the inputs above, which have 8px padding and a 1px border. */}
              <span className="pr-[9px]">{+analysis.targetSum.toFixed(2)}%</span>
              {targetsOff && <span className="sr-only">Targets need to add up to 100%.</span>}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      {keepingCash && (
        <p className="mt-3 text-[13px] text-ink-3">
          Fund targets apply to what&rsquo;s invested after the cash you keep. Weights are a share of
          everything.
        </p>
      )}
    </div>
  );
}

function WeightCell({ weight, target, scale }: { weight: number | null; target: number | null; scale: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 shrink-0">
        <WeightBar weight={weight} target={target} scale={scale} />
      </div>
      <span className="w-12 text-right tabular-nums">{weight !== null ? percent(weight) : dash}</span>
    </div>
  );
}

function DriftCell({ drift }: { drift: number | null }) {
  const notable = drift !== null && Math.abs(drift) >= 1;
  return (
    <td className={`py-2.5 pl-3 text-right tabular-nums ${notable ? "font-medium text-ink" : "text-ink-3"}`}>
      {drift !== null ? points(drift) : dash}
    </td>
  );
}
