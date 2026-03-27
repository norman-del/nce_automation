export const dynamic = 'force-dynamic'

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/client";

async function getPayouts() {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("payouts")
      .select("*")
      .order("payout_date", { ascending: false })
      .limit(50);
    return data ?? [];
  } catch {
    return [];
  }
}

const statusColors: Record<string, string> = {
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

export default async function PayoutsPage() {
  const payouts = await getPayouts();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Payouts</h2>
          <p className="mt-1 text-sm text-gray-500">Shopify payouts pulled from the API</p>
        </div>
        <form action="/api/shopify/sync" method="POST">
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
          >
            Sync Payouts
          </button>
        </form>
      </div>

      {payouts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No payouts yet. Click &ldquo;Sync Payouts&rdquo; to pull from Shopify.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Gross</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Fees</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Net</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payouts.map((payout: {
                id: string;
                payout_date: string;
                gross_amount: number | null;
                total_fees: number | null;
                amount: number;
                currency: string;
                sync_status: string;
              }) => (
                <tr key={payout.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{payout.payout_date}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {payout.gross_amount != null
                      ? `£${Number(payout.gross_amount).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {payout.total_fees != null
                      ? `£${Number(payout.total_fees).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    £{Number(payout.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[payout.sync_status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {payout.sync_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/payouts/${payout.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
