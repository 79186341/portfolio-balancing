import { PortfolioApp } from "@/components/portfolio-app";
import { getPortfolio } from "@/lib/portfolio";
import { getSnapshots } from "@/lib/snapshots";

// Holdings live in the database, so render on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const portfolio = await getPortfolio();
  const snapshots = await getSnapshots(portfolio.id);
  return <PortfolioApp initial={portfolio} snapshots={snapshots} />;
}
