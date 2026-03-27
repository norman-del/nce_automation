import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SidebarNav from "@/app/components/SidebarNav";
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
      <body className="min-h-full flex bg-canvas text-primary">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-surface border-r border-edge flex flex-col">
          <div className="px-6 py-5 border-b border-edge">
            <h1 className="text-sm font-semibold text-primary leading-tight">
              Shopify ↔ QBO
              <br />
              <span className="text-secondary font-normal">Fee Sync</span>
            </h1>
          </div>
          <SidebarNav />
          <div className="px-6 py-4 border-t border-edge">
            <p className="text-xs text-secondary">NCE Equipment</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-8 bg-canvas">{children}</main>
      </body>
    </html>
  );
}
