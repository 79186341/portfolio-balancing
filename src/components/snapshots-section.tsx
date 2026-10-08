"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteSnapshot,
  renameSnapshot,
  saveSnapshot,
  type RenameSnapshotResult,
  type SaveSnapshotResult,
} from "@/app/actions";
import { compare, totalValue } from "@/lib/compare";
import { longDate, longDateTime, money, signed } from "@/lib/format";
import { SNAPSHOT_LABEL_MAX_LENGTH, type PortfolioData, type SnapshotData } from "@/lib/types";
import { SnapshotComparison } from "./snapshot-comparison";
import { useHydrated } from "./use-hydrated";

interface SnapshotsSectionProps {
  accountId: number;
  /** Newest first. */
  initial: SnapshotData[];
  /** The holdings on screen, compared as "Now". */
  current: PortfolioData;
  /** Sends any edits still waiting to autosave, so the snapshot includes them. */
  onBeforeSave: () => void;
}

const fieldClass =
  "rounded-[3px] border border-rule-strong bg-sheet px-2 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const primaryButton =
  "rounded-[3px] bg-accent px-3 py-1.5 font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const quietButton =
  "rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
const dash = <span className="text-ink-3">—</span>;
const serverDown = "Is the app's server running?";

export function SnapshotsSection({ accountId, initial, current, onBeforeSave }: SnapshotsSectionProps) {
  const [snapshots, setSnapshots] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fromId, setFromId] = useState<number | null>(initial[0]?.id ?? null);
  const [toId, setToId] = useState<number | "now">("now");
  const hydrated = useHydrated();

  const values = useMemo(() => snapshots.map((s) => totalValue(s)), [snapshots]);

  // Compare the chosen snapshot (the latest if it's been deleted) with a later one, or with now.
  const fromIndex = Math.max(0, snapshots.findIndex((s) => s.id === fromId));
  const from = snapshots[fromIndex];
  const toIndex = snapshots.findIndex((s) => s.id === toId);
  const to = toIndex >= 0 && toIndex < fromIndex ? snapshots[toIndex] : null;
  const comparison = useMemo(() => (from ? compare(from, to ?? current) : null), [from, to, current]);

  const optionLabel = (s: SnapshotData) => {
    if (!hydrated) return s.label;
    const date = longDate(s.createdAt);
    return s.label === date ? s.label : `${s.label} (${date})`;
  };

  const save = async (label: string) => {
    onBeforeSave();
    const result = await saveSnapshot(accountId, label);
    if (result.ok) {
      setSnapshots((list) => [result.snapshot, ...list]);
      setFromId((id) => id ?? result.snapshot.id);
      setSaving(false);
    }
    return result;
  };

  const rename = async (id: number, label: string) => {
    const result = await renameSnapshot(accountId, id, label);
    if (result.ok) setSnapshots((list) => list.map((s) => (s.id === id ? { ...s, label: result.label } : s)));
    return result;
  };

  const remove = async (snapshot: SnapshotData) => {
    if (!window.confirm(`Delete the snapshot “${snapshot.label}”?`)) return;
    setSnapshots((list) => list.filter((s) => s.id !== snapshot.id));
    try {
      await deleteSnapshot(accountId, snapshot.id);
    } catch {
      setProblem(`Couldn't delete “${snapshot.label}”. Reload the page to see what was saved.`);
    }
  };

  const pickFrom = (id: number) => {
    setFromId(id);
    // Only a later snapshot can be the other side; otherwise compare with now.
    const later = snapshots.slice(0, snapshots.findIndex((s) => s.id === id));
    if (!later.some((s) => s.id === toId)) setToId("now");
  };

  return (
    <section aria-labelledby="snapshots-heading" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="snapshots-heading" className="text-xl font-semibold tracking-tight">
          Snapshots
        </h2>
        {!saving && (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="rounded-[3px] px-1 py-1 text-[15px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            + Save a snapshot
          </button>
        )}
      </div>

      {saving && <SaveForm onSave={save} onClose={() => setSaving(false)} />}

      {problem && (
        <p role="alert" className="mb-3 text-[13px] text-sell">
          {problem}
        </p>
      )}

      {snapshots.length === 0 ? (
        <p className="max-w-prose text-[15px] text-ink-2">
          A snapshot keeps a copy of your units, cash and prices under a label you choose. Save one now and
          another after your next contribution or rebalance to see how things changed.
        </p>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-[15px]">
              <caption className="sr-only">
                Saved snapshots, newest first, with their total value in CAD and the change since the one before.
              </caption>
              <thead>
                <tr className="border-b border-rule-strong text-[13px] text-ink-3">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Snapshot</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Value (CAD)</th>
                  <th scope="col" className="w-0 py-2 pl-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot, i) => {
                  const value = values[i];
                  const previous = values[i + 1];
                  return (
                    <SnapshotRow
                      key={snapshot.id}
                      snapshot={snapshot}
                      value={value}
                      change={value !== null && previous != null ? value - previous : null}
                      hydrated={hydrated}
                      onRename={rename}
                      onDelete={remove}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {from && comparison && (
            <div className="mt-8">
              <h3 className="text-[17px] font-semibold tracking-tight">Compare</h3>
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-3 text-[15px]">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] text-ink-3">From</span>
                  <select
                    value={from.id}
                    onChange={(e) => pickFrom(Number(e.target.value))}
                    className={`${fieldClass} max-w-full py-[5px]`}
                  >
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {optionLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] text-ink-3">To</span>
                  <select
                    value={to?.id ?? "now"}
                    onChange={(e) => setToId(e.target.value === "now" ? "now" : Number(e.target.value))}
                    className={`${fieldClass} max-w-full py-[5px]`}
                  >
                    <option value="now">Now</option>
                    {snapshots.slice(0, fromIndex).map((s) => (
                      <option key={s.id} value={s.id}>
                        {optionLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4">
                <SnapshotComparison comparison={comparison} fromLabel={from.label} toLabel={to?.label ?? "now"} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SaveForm({
  onSave,
  onClose,
}: {
  onSave: (label: string) => Promise<SaveSnapshotResult>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(() => longDate(new Date().toISOString()));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mb-5 rounded-md border border-rule bg-sheet/60 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            const result = await onSave(label);
            if (!result.ok) setError(result.error);
          } catch {
            setError(`Couldn't save the snapshot. ${serverDown}`);
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[15px]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-ink-3">Label</span>
          <input
            autoFocus
            required
            maxLength={SNAPSHOT_LABEL_MAX_LENGTH}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            autoComplete="off"
            className={`${fieldClass} w-72 max-w-full`}
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Save snapshot"}
          </button>
          <button type="button" onClick={onClose} className={quietButton}>
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
          Saves the units, cash and prices shown above. Editing your holdings later won&rsquo;t change it.
        </p>
      )}
    </form>
  );
}

interface SnapshotRowProps {
  snapshot: SnapshotData;
  value: number | null;
  /** Change in value since the snapshot before; null for the oldest, or while a value is unknown. */
  change: number | null;
  hydrated: boolean;
  onRename: (id: number, label: string) => Promise<RenameSnapshotResult>;
  onDelete: (snapshot: SnapshotData) => void;
}

function SnapshotRow({ snapshot, value, change, hydrated, onRename, onDelete }: SnapshotRowProps) {
  // The label being edited, or null when not renaming.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stopEditing = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <tr className="border-b border-rule">
      <th scope="row" className="py-2.5 pr-3 text-left align-middle font-normal">
        {draft === null ? (
          <>
            <div className="font-semibold text-ink">{snapshot.label}</div>
            <div
              className="mt-0.5 text-[13px] text-ink-3"
              title={hydrated && snapshot.pricesAsOf ? `Prices as of ${longDateTime(snapshot.pricesAsOf)}` : undefined}
            >
              {hydrated ? longDateTime(snapshot.createdAt) : "\u00a0"}
            </div>
          </>
        ) : (
          <form
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                try {
                  const result = await onRename(snapshot.id, draft);
                  if (result.ok) stopEditing();
                  else setError(result.error);
                } catch {
                  setError(`Couldn't rename it. ${serverDown}`);
                }
              });
            }}
          >
            <input
              autoFocus
              required
              maxLength={SNAPSHOT_LABEL_MAX_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Escape") stopEditing();
              }}
              aria-label="Snapshot label"
              autoComplete="off"
              className={`${fieldClass} w-60 max-w-full text-[15px]`}
            />
            <button type="submit" disabled={pending} className={`${primaryButton} py-1 text-[13px]`}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={stopEditing} className={`${quietButton} py-1 text-[13px]`}>
              Cancel
            </button>
            {error && (
              <p role="alert" className="w-full text-[13px] text-sell">
                {error}
              </p>
            )}
          </form>
        )}
      </th>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <div className="whitespace-nowrap text-ink">{value !== null ? money(value) : dash}</div>
        <div className="mt-0.5 whitespace-nowrap text-[13px] text-ink-3" title={change !== null ? "Since the snapshot before" : undefined}>
          {change !== null ? (
            <>
              {signed(change, money)}
              <span className="sr-only"> since the snapshot before</span>
            </>
          ) : (
            "\u00a0"
          )}
        </div>
      </td>
      <td className="py-2.5 pl-3 text-right text-[13px]">
        {draft === null && (
          <div className="flex flex-col items-end sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDraft(snapshot.label)}
              aria-label={`Rename ${snapshot.label}`}
              className="rounded-[3px] px-1.5 py-1 text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDelete(snapshot)}
              aria-label={`Delete ${snapshot.label}`}
              className="rounded-[3px] px-1.5 py-1 text-ink-3 hover:text-sell focus-visible:outline-2 focus-visible:outline-accent"
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
