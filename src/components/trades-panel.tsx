"use client";

import { money, percent } from "@/lib/format";
import type { Analysis, Conversion, Currency, Trade } from "@/lib/rebalance";

interface TradesPanelProps {
  analysis: Analysis;
  allowSells: boolean;
  onAllowSellsChange: (allowSells: boolean) => void;
  rateSource: string | null;
}

type Step = { kind: "trade"; trade: Trade } | { kind: "convert"; conversion: Conversion };

/** "US$227.30", or "$323.80 CAD" so a CAD amount can't be misread beside a USD one. */
function labelled(amount: number, currency: Currency) {
  return currency === "CAD" ? `${money(amount)} CAD` : money(amount, currency);
}

export function TradesPanel({ analysis, allowSells, onAllowSellsChange, rateSource }: TradesPanelProps) {
  const { plan } = analysis;

  // Sell first to raise cash, then convert currency, then buy.
  const steps: Step[] = plan
    ? [
        ...plan.trades.filter((t) => t.units < 0).map((trade): Step => ({ kind: "trade", trade })),
        ...(plan.conversion ? [{ kind: "convert", conversion: plan.conversion } as Step] : []),
        ...plan.trades.filter((t) => t.units > 0).map((trade): Step => ({ kind: "trade", trade })),
      ]
    : [];

  return (
    <section aria-labelledby="trades-heading" className="rounded-md border border-rule-strong bg-sheet">
      <div className="border-b border-rule px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trades-heading" className="text-xl font-semibold tracking-tight">
            Trades
          </h2>
          <div role="group" aria-label="What the plan may do" className="inline-flex rounded-[4px] border border-rule-strong p-0.5 text-[13px]">
            {[
              { value: true, label: "Buy and sell" },
              { value: false, label: "Buy only" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={allowSells === option.value}
                onClick={() => onAllowSellsChange(option.value)}
                className={`rounded-[3px] px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  allowSells === option.value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          {allowSells
            ? "Sells what's over target to buy what's under, in whole shares."
            : "Puts spare cash into what's furthest under target. Nothing is sold."}
        </p>
      </div>

      <div className="px-5 py-2" aria-live="polite">
        {!plan ? (
          <ul className="space-y-2 py-3 text-[15px] text-ink-2">
            {analysis.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : steps.length === 0 ? (
          <p className="py-3 text-[15px] text-ink-2">
            {allowSells
              ? "You're on target. No trades needed."
              : "There isn't enough spare cash to buy anything. Add cash, or switch to buy and sell to rebalance."}
          </p>
        ) : (
          <ol>
            {steps.map((step, i) => (
              <li
                key={step.kind === "trade" ? step.trade.id : "convert"}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 border-b border-rule py-3 last:border-b-0"
              >
                <span className="pt-0.5 tabular-nums text-ink-3">{i + 1}</span>
                {step.kind === "trade" ? (
                  <TradeStep trade={step.trade} />
                ) : (
                  <ConvertStep conversion={step.conversion} source={rateSource} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {plan && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-rule px-5 py-4 text-[13px]">
          <dt className="text-ink-3">Cash after</dt>
          <dd className="text-right tabular-nums text-ink-2">
            {labelled(plan.cashAfter.CAD, "CAD")} and {money(plan.cashAfter.USD, "USD")}
          </dd>
          <dt className="text-ink-3">Largest drift</dt>
          <dd className="text-right tabular-nums text-ink-2">
            {analysis.maxDrift !== null && `${analysis.maxDrift.toFixed(1)} → `}
            {plan.maxDriftAfter.toFixed(1)} pts
          </dd>
        </dl>
      )}
    </section>
  );
}

function TradeStep({ trade }: { trade: Trade }) {
  const selling = trade.units < 0;
  return (
    <>
      <div className="min-w-0">
        <p className="text-[17px] leading-6">
          <span className={`font-semibold ${selling ? "text-sell" : "text-accent"}`}>
            {selling ? "Sell" : "Buy"}
          </span>{" "}
          <span className="tabular-nums">{Math.abs(trade.units).toLocaleString("en-CA")}</span>{" "}
          <span className="font-semibold">{trade.symbol}</span>
        </p>
        <p className="text-[13px] tabular-nums text-ink-3">
          {percent(trade.weightBefore)} → {percent(trade.weightAfter)}
        </p>
      </div>
      <span className="pt-0.5 text-right tabular-nums text-ink-2">
        {money(Math.abs(trade.amount), trade.currency)}
      </span>
    </>
  );
}

function ConvertStep({ conversion, source }: { conversion: Conversion; source: string | null }) {
  return (
    <div className="col-span-2 min-w-0">
      <p className="text-[17px] leading-6">
        <span className="font-semibold">Convert</span>{" "}
        <span className="whitespace-nowrap tabular-nums">{labelled(conversion.amountFrom, conversion.from)}</span>{" "}
        to <span className="whitespace-nowrap tabular-nums">{labelled(conversion.amountTo, conversion.to)}</span>
      </p>
      <p className="text-[13px] text-ink-3">
        At {conversion.rate.toFixed(4)}
        {source ? ` (${source})` : ""}. Your broker&rsquo;s rate will be a little worse, so leave some room.
      </p>
    </div>
  );
}
