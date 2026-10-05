"use client";

import type { Change, Comparison, FundComparison, Position } from "@/lib/compare";
import { money, percent, points, signed, units } from "@/lib/format";
import { CurrencyTag } from "./currency-tag";

interface SnapshotComparisonProps {
  comparison: Comparison;
  fromLabel: string;
  toLabel: string;
}

const dash = <span className="text-ink-3">—</span>;
const blank = "\u00a0"; // keeps every figure two lines tall so rows line up

// On narrow screens the table scrolls sideways under a pinned first column.
const firstColumn = "sticky left-0 z-10 bg-paper pr-3 text-left align-middle sm:static";
const cell = "px-3 text-right tabular-nums";

type Field = keyof Change;

/** "before → after" over the change: the shape of every figure in the table. */
function Figures({
  row,
  field,
  format,
  formatChange,
  className = cell,
}: {
  row: { from: Position | null; to: Position | null; change: Change };
  field: Field;
  format: (value: number) => string;
  formatChange: (change: number) => string;
  className?: string;
}) {
  const show = (position: Position | null) => {
    const value = position?.[field] ?? null;
    return value === null ? dash : format(value);
  };
  const change = row.change[field];
  return (
    <td className={`${className} py-2.5`}>
      <div className="whitespace-nowrap text-ink">
        {show(row.from)}
        <span aria-hidden className="px-1.5 text-ink-3">→</span>
        <span className="sr-only"> to </span>
        {show(row.to)}
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[13px] text-ink-3">
        {change === null ? blank : formatChange(change)}
      </div>
    </td>
  );
}

/** Just the percentage, so the table fits beside the trades; the prices themselves are in the tooltip. */
function PriceChange({ row }: { row: FundComparison }) {
  const price = (position: Position | null) =>
    position?.price != null ? money(position.price, row.currency) : "—";
  const change = row.change.price;
  return (
    <td className={`${cell} py-2.5`} title={`${price(row.from)} → ${price(row.to)}`}>
      <div className="text-ink">{change === null ? dash : signed(change, percent)}</div>
      <div className="mt-0.5 text-[13px]">{blank}</div>
    </td>
  );
}

const weightChange = (change: number) => `${points(change)} pts`;

export function SnapshotComparison({ comparison, fromLabel, toLabel }: SnapshotComparisonProps) {
  const { funds, cash, total, usdCad } = comparison;
  const holdsUsd =
    funds.some((f) => f.currency === "USD") ||
    cash.some((c) => c.currency === "USD" && (c.from.units !== 0 || c.to.units !== 0));

  return (
    <div>
      {/* `relative` keeps the sr-only text inside the scroll box instead of widening the page. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[15px]">
          <caption className="sr-only">
            How each fund and cash balance changed from {fromLabel} to {toLabel}. Values are in CAD.
          </caption>
          <thead>
            <tr className="border-b border-rule-strong text-[13px] text-ink-3">
              <th scope="col" className={`${firstColumn} py-2 font-medium`}>Fund</th>
              <th scope="col" className={`${cell} py-2 font-medium`}>Units</th>
              <th scope="col" className={`${cell} py-2 font-medium`}>Price change</th>
              <th scope="col" className={`${cell} py-2 font-medium`}>Value (CAD)</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((fund) => {
              const note = fund.from === null ? "Added" : fund.to === null ? "Removed" : null;
              return (
                <tr key={`${fund.symbol}:${fund.currency}`} className="border-b border-rule">
                  <th scope="row" className={`${firstColumn} py-2.5 font-normal`}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{fund.symbol}</span>
                      <CurrencyTag currency={fund.currency} />
                    </div>
                    {note ? (
                      <div className="mt-0.5 text-[13px] text-ink-3">{note}</div>
                    ) : (
                      <div className="mt-0.5 hidden max-w-[12rem] truncate text-[13px] text-ink-3 sm:block" title={fund.name}>
                        {fund.name}
                      </div>
                    )}
                  </th>
                  <Figures row={fund} field="units" format={units} formatChange={(change) => signed(change, units)} />
                  <PriceChange row={fund} />
                  <Figures row={fund} field="value" format={money} formatChange={(change) => signed(change, money)} />
                  <Figures row={fund} field="weight" format={percent} formatChange={weightChange} className="pl-3 text-right tabular-nums" />
                </tr>
              );
            })}

            {cash.map((row, i) => {
              const amount = (value: number) => money(value, row.currency);
              return (
                <tr key={row.currency} className={`border-b border-rule ${i === 0 ? "border-t border-t-rule-strong" : ""}`}>
                  <th scope="row" className={`${firstColumn} py-2.5 font-normal`}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">Cash</span>
                      <CurrencyTag currency={row.currency} />
                    </div>
                  </th>
                  <Figures row={row} field="units" format={amount} formatChange={(change) => signed(change, amount)} />
                  <td />
                  <Figures row={row} field="value" format={money} formatChange={(change) => signed(change, money)} />
                  <Figures row={row} field="weight" format={percent} formatChange={weightChange} className="pl-3 text-right tabular-nums" />
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-b-[3px] border-double border-ink">
              <th scope="row" className={`${firstColumn} py-3 font-semibold`}>Total</th>
              <td colSpan={2} />
              <td className={`${cell} py-3`}>
                <div className="whitespace-nowrap font-semibold text-ink">
                  {total.from !== null ? money(total.from) : dash}
                  <span aria-hidden className="px-1.5 font-normal text-ink-3">→</span>
                  <span className="sr-only"> to </span>
                  {total.to !== null ? money(total.to) : dash}
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[13px] text-ink-2">
                  {total.change === null
                    ? blank
                    : `${signed(total.change, money)}${total.percent !== null ? ` (${signed(total.percent, percent)})` : ""}`}
                </div>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {holdsUsd && usdCad.from !== null && usdCad.to !== null && (
        <p className="mt-3 text-[13px] text-ink-3">
          US-dollar holdings are valued at each date&rsquo;s exchange rate: USD/CAD {usdCad.from.toFixed(4)} →{" "}
          {usdCad.to.toFixed(4)}.
        </p>
      )}
    </div>
  );
}
