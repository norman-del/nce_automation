import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/app/components/AppShell";
import { getStaffUser } from "@/lib/auth/staff";
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
  title: "NCE Operations",
  description: "Internal operations dashboard for Nationwide Catering Equipment",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let staff: { name: string; role: 'admin' | 'staff' } | null = null
  try {
    const user = await getStaffUser()
    if (user) {
      staff = { name: user.name, role: user.role }
    }
  } catch {
    // Not logged in or staff lookup failed — staff stays null
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-canvas text-primary">
        <AppShell staff={staff}>{children}</AppShell>
      </body>
    </html>
  );
}
