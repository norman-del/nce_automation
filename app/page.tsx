export const dynamic = 'force-dynamic'

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/client";

async function getDashboardStats() {
  try {
    const db = createServiceClient();
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const [payoutsRes, syncedRes, errorsRes, pendingRes] = await Promise.all([
      db
        .from("payouts")
        .select("id", { count: "exact" })
        .gte("payout_date", firstOfMonth),
      db
        .from("payouts")
        .select("id", { count: "exact" })
        .eq("sync_status", "synced")
        .gte("payout_date", firstOfMonth),
      db
        .from("payouts")
        .select("id", { count: "exact" })
        .eq("sync_status", "error"),
      db
        .from("payouts")
        .select("id", { count: "exact" })
        .eq("sync_status", "pending"),
    ]);

    return {
      payoutsThisMonth: payoutsRes.count ?? 0,
      syncedThisMonth: syncedRes.count ?? 0,
      errors: errorsRes.count ?? 0,
      pending: pendingRes.count ?? 0,
    };
  } catch {
    return { payoutsThisMonth: 0, syncedThisMonth: 0, errors: 0, pending: 0 };
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    { label: "Payouts this month", value: stats.payoutsThisMonth, color: "text-gray-900" },
    { label: "Synced this month", value: stats.syncedThisMonth, color: "text-green-600" },
    { label: "Pending", value: stats.pending, color: "text-yellow-600" },
    { label: "Errors", value: stats.errors, color: "text-red-600" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Shopify payout sync status overview
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-lg border border-gray-200 p-5"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {card.label}
            </p>
            <p className={`mt-2 text-3xl font-semibold ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href="/payouts"
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
        >
          View Payouts
        </Link>
        <Link
          href="/settings"
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50 transition-colors"
        >
          Settings
        </Link>
      </div>
    </div>
  );
}
