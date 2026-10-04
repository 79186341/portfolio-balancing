"use client";

import { useState, useTransition } from "react";
import type { AddAssetResult } from "@/app/actions";
import type { Currency } from "@/lib/rebalance";

interface AddFundFormProps {
  /** Pre-fills the target with whatever is left to allocate. */
  unallocated: number;
  onAdd: (input: { symbol: string; currency: Currency; targetPercent: number }) => Promise<AddAssetResult>;
}

const fieldClass =
  "rounded-[3px] border border-rule-strong bg-sheet px-2 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function AddFundForm({ unallocated, onAdd }: AddFundFormProps) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [currency, setCurrency] = useState<Currency>("CAD");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTarget(String(Math.max(0, +unallocated.toFixed(2))));
          setOpen(true);
        }}
        className="rounded-[3px] px-1 py-1 text-[15px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        + Add a fund
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    setSymbol("");
    setError(null);
  };

  return (
    <form
      className="rounded-md border border-rule bg-sheet/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const targetPercent = target.trim() === "" ? 0 : Number(target);
        startTransition(async () => {
          const result = await onAdd({ symbol, currency, targetPercent });
          if (result.ok) close();
          else setError(result.error);
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[15px]">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-3">Ticker</span>
          <input
            autoFocus
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="VCN"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} w-28 uppercase placeholder:normal-case placeholder:text-ink-3/70`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-3">Listed in</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className={`${fieldClass} py-[5px]`}
          >
            <option value="CAD">CAD, on the TSX</option>
            <option value="USD">USD, in the US</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-3">Target</span>
          <span className={`${fieldClass} inline-flex w-24 items-baseline gap-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent`}>
            <input
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
            />
            <span aria-hidden className="text-ink-3">%</span>
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[3px] bg-accent px-3 py-1.5 font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {pending ? "Looking it up…" : "Add fund"}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-sell">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">
          The ticker is checked against live prices before it&rsquo;s added.
        </p>
      )}
    </form>
  );
}
