import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import "./globals.css";

const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Account pages put the account's name first: "TFSA · Portfolio Rebalancer".
  title: { default: "Portfolio Rebalancer", template: "%s · Portfolio Rebalancer" },
  description: "Enter your holdings and see the trades that bring your portfolio back to its targets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${franklin.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
