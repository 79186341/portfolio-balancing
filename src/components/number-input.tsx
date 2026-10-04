"use client";

import { useState } from "react";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Called when editing ends (blur or Enter). */
  onCommit?: () => void;
  /** How the value reads when the field isn't being edited. */
  format: (value: number) => string;
  label: string;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Accepts "1,250.50", "$300" or "" (zero); only valid numbers reach onChange. */
function parse(text: string): number | null {
  const cleaned = text.replace(/[\s,$]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function NumberInput({
  value,
  onChange,
  onCommit,
  format,
  label,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  prefix,
  suffix,
  className = "w-24",
}: NumberInputProps) {
  // While focused, the raw text being typed; null otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const [valueOnFocus, setValueOnFocus] = useState(value);

  const parsed = draft === null ? value : parse(draft);
  const invalid = parsed === null || parsed < min || parsed > max;

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-[3px] border bg-sheet px-2 py-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent ${
        invalid ? "border-sell" : "border-rule-strong"
      } ${className}`}
    >
      {prefix && (
        <span aria-hidden className="text-ink-3">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="w-full min-w-0 bg-transparent text-right tabular-nums text-ink outline-none"
        value={draft ?? format(value)}
        onFocus={(event) => {
          const input = event.currentTarget;
          setValueOnFocus(value);
          setDraft(String(Number(value.toFixed(6))));
          requestAnimationFrame(() => {
            if (document.activeElement === input) input.select();
          });
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = parse(event.target.value);
          if (next !== null && next >= min && next <= max) onChange(next);
        }}
        onBlur={() => {
          setDraft(null);
          onCommit?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            onChange(valueOnFocus);
            event.currentTarget.blur();
          }
        }}
      />
      {suffix && (
        <span aria-hidden className="text-ink-3">
          {suffix}
        </span>
      )}
    </span>
  );
}
