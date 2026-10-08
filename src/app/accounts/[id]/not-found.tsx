import Link from "next/link";

export default function AccountNotFound() {
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pb-16 pt-6 sm:px-6 sm:pt-10 xl:px-8">
      <h1 className="border-b border-rule-strong pb-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
        Portfolio rebalancer
      </h1>
      <p className="mt-8 text-[15px] text-ink-2">There&rsquo;s no account here. It may have been deleted.</p>
      <Link
        href="/"
        className="mt-3 inline-block rounded-[3px] py-1 text-[15px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Go to your accounts
      </Link>
    </main>
  );
}
