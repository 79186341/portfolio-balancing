import { PortfolioApp } from "@/components/portfolio-app";
import { getPortfolio } from "@/lib/portfolio";

// Holdings live in the database, so render on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const portfolio = await getPortfolio();
  return <PortfolioApp initial={portfolio} />;
}
