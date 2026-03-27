import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shopify-QBO Fee Sync",
  description: "Automate Shopify payout fee reconciliation with QuickBooks Online",
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/payouts", label: "Payouts" },
  { href: "/sync-log", label: "Sync Log" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-gray-50">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-6 py-5 border-b border-gray-200">
            <h1 className="text-sm font-semibold text-gray-900 leading-tight">
              Shopify ↔ QBO<br />
              <span className="text-gray-500 font-normal">Fee Sync</span>
            </h1>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-8">{children}</main>
      </body>
    </html>
  );
}
