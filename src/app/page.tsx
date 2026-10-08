import { redirect } from "next/navigation";
import { getAccounts } from "@/lib/portfolio";

// Accounts live in the database, so look them up on every request.
export const dynamic = "force-dynamic";

/** Opens the first account. */
export default async function Home() {
  const [first] = await getAccounts();
  redirect(`/accounts/${first.id}`);
}
