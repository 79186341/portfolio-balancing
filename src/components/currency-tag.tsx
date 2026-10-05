import type { Currency } from "@/lib/rebalance";

export function CurrencyTag({ currency }: { currency: Currency }) {
  return (
    <span
      title={currency === "CAD" ? "Canadian dollars, listed on the TSX" : "US dollars, listed in the US"}
      className="rounded-[3px] border border-rule-strong px-1 text-[11px] font-medium leading-4 text-ink-2"
    >
      {currency}
    </span>
  );
}
