import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PortfolioApp } from "@/components/portfolio-app";
import { getAccounts, getPortfolio } from "@/lib/portfolio";
import { getSnapshots } from "@/lib/snapshots";

// Holdings live in the database, so render on every request.
export const dynamic = "force-dynamic";

// Shared by generateMetadata and the page within one request.
const loadAccounts = cache(getAccounts);

/** The account id in the URL, or null if it isn't one. */
function accountId(param: string): number | null {
  return /^[1-9]\d{0,8}$/.test(param) ? Number(param) : null;
}

export async function generateMetadata({ params }: PageProps<"/accounts/[id]">): Promise<Metadata> {
  const id = accountId((await params).id);
  const account = (await loadAccounts()).find((a) => a.id === id);
  return account ? { title: account.name } : {};
}

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  const id = accountId((await params).id);
  const portfolio = id === null ? null : await getPortfolio(id);
  if (!portfolio) notFound();
  const [accounts, snapshots] = await Promise.all([loadAccounts(), getSnapshots(portfolio.id)]);
  // Keyed so that switching accounts starts each one fresh.
  return <PortfolioApp key={portfolio.id} accounts={accounts} initial={portfolio} snapshots={snapshots} />;
}
