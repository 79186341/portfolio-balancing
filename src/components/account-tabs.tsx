"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { addAccount, deleteAccount, renameAccount } from "@/app/actions";
import { ACCOUNT_NAME_MAX_LENGTH, type AccountData } from "@/lib/types";

interface AccountTabsProps {
  /** In the order they were added. */
  accounts: AccountData[];
  /** The account on screen. */
  currentId: number;
}

const fieldClass =
  "rounded-[3px] border border-rule-strong bg-sheet px-2 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const primaryButton =
  "rounded-[3px] bg-accent px-3 py-1.5 font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const quietButton =
  "rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
const formClass = "mt-4 rounded-md border border-rule bg-sheet/60 p-4";
const serverDown = "Is the app's server running?";

// Every tab has a full border so they're all the same height; only the current
// one shows its sides, and its open bottom breaks the rule under the header.
const tab = "whitespace-nowrap rounded-t-[4px] border py-2 text-[15px] font-medium";
const tabFocus = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** A tab per account on the rule under the header, with forms to add, rename and delete accounts. */
export function AccountTabs({ accounts, currentId }: AccountTabsProps) {
  const [form, setForm] = useState<"add" | "edit" | null>(null);
  const current = accounts.find((a) => a.id === currentId) ?? { id: currentId, name: "this account" };

  return (
    <>
      {/* Scrolls sideways if the tabs don't fit. */}
      <div className="flex items-end overflow-x-auto">
        <nav aria-label="Accounts" className="flex shrink-0 items-end">
          {accounts.map((account) =>
            account.id === currentId ? (
              <div key={account.id} className={`${tab} flex items-center gap-1 border-rule-strong border-b-transparent pl-3.5 pr-1.5`}>
                <Link href={`/accounts/${account.id}`} aria-current="page" className={`rounded-[3px] text-ink ${tabFocus}`}>
                  {account.name}
                </Link>
                <button
                  type="button"
                  onClick={() => setForm(form === "edit" ? null : "edit")}
                  aria-expanded={form === "edit"}
                  aria-label={`Rename or delete ${account.name}`}
                  title="Rename or delete"
                  className="rounded-[3px] p-1 text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="block">
                    <path
                      d="M10.5 2.5l3 3L6 13H3v-3zM8.75 4.25l3 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <Link
                key={account.id}
                href={`/accounts/${account.id}`}
                className={`${tab} border-transparent border-b-rule-strong px-3.5 text-ink-2 hover:text-ink ${tabFocus}`}
              >
                {account.name}
              </Link>
            ),
          )}
        </nav>
        <div className="flex min-w-max flex-1 items-center self-stretch border-b border-rule-strong pl-2.5">
          {form !== "add" && (
            <button
              type="button"
              onClick={() => setForm("add")}
              className="rounded-[3px] px-1 py-1 text-[15px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              + Add account
            </button>
          )}
        </div>
      </div>

      {form === "add" && <AddAccountForm current={current} onClose={() => setForm(null)} />}
      {form === "edit" && (
        <EditAccountForm current={current} canDelete={accounts.length > 1} onClose={() => setForm(null)} />
      )}
    </>
  );
}

function AddAccountForm({ current, onClose }: { current: AccountData; onClose: () => void }) {
  const [name, setName] = useState("");
  const [copy, setCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={formClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            // Adding opens the new account, so this only returns if the name is rejected.
            const result = await addAccount({ name, copyFrom: copy ? current.id : null });
            setError(result.error);
          } catch (error) {
            unstable_rethrow(error); // let the move to the new account go ahead
            setError(`Couldn't add the account. ${serverDown}`);
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[15px]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-ink-3">New account</span>
          <input
            autoFocus
            required
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="RRSP"
            autoComplete="off"
            className={`${fieldClass} w-60 max-w-full placeholder:text-ink-3/70`}
          />
        </label>
        <label className="flex items-center gap-2 py-1.5">
          <input
            type="checkbox"
            checked={copy}
            onChange={(e) => setCopy(e.target.checked)}
            className="size-4 accent-accent"
          />
          Same funds and targets as {current.name}
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Adding…" : "Add account"}
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
          Each account has its own holdings, cash and snapshots. A new one starts with no units or cash.
        </p>
      )}
    </form>
  );
}

function EditAccountForm({
  current,
  canDelete,
  onClose,
}: {
  current: AccountData;
  /** False for the only account. */
  canDelete: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(current.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const remove = () => {
    if (!window.confirm(`Delete ${current.name}, with its holdings and snapshots? This can't be undone.`)) return;
    setError(null);
    startDelete(async () => {
      try {
        // Deleting opens another account, so this only returns if it can't be deleted.
        const result = await deleteAccount(current.id);
        setError(result.error);
      } catch (error) {
        unstable_rethrow(error); // let the move to another account go ahead
        setError(`Couldn't delete ${current.name}. ${serverDown}`);
      }
    });
  };

  return (
    <form
      className={formClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        startSave(async () => {
          try {
            const result = await renameAccount(current.id, name);
            if (result.ok) onClose();
            else setError(result.error);
          } catch {
            setError(`Couldn't rename it. ${serverDown}`);
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[15px]">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-ink-3">Account name</span>
          <input
            autoFocus
            required
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            autoComplete="off"
            className={`${fieldClass} w-60 max-w-full`}
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving || deleting} className={primaryButton}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className={quietButton}>
            Cancel
          </button>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={saving || deleting}
            className="ml-auto rounded-[3px] px-1.5 py-1.5 text-ink-3 hover:text-sell focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-sell">
          {error}
        </p>
      )}
    </form>
  );
}
