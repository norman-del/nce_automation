export const dynamic = 'force-dynamic'

import { createServiceClient } from "@/lib/supabase/client";
import { notFound } from "next/navigation";
import SyncButton from "./SyncButton";

async function getPayout(id: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("payouts")
    .select("*, payout_transactions(*)")
    .eq("id", id)
    .single();
  return data;
}

const paymentStatusColors: Record<string, string> = {
  payment_created: "bg-green-100 text-green-700",
  invoice_found: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  no_invoice: "bg-gray-100 text-gray-500",
  error: "bg-red-100 text-red-700",
};

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payout = await getPayout(id);
  if (!payout) notFound();

  const transactions = (payout.payout_transactions ?? []) as Array<{
    id: string;
    order_number: string | null;
    customer_name: string | null;
    company_name: string | null;
    amount: number;
    fee: number;
    net: number;
    payment_status: string;
    qbo_invoice_id: string | null;
    qbo_payment_id: string | null;
  }>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Payout — {payout.payout_date}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Net: £{Number(payout.amount).toFixed(2)} &middot; Fees: £
            {Number(payout.total_fees ?? 0).toFixed(2)} &middot;{" "}
            {payout.journal_entry_id
              ? `Journal entry: ${payout.journal_entry_id}`
              : "No journal entry yet"}
          </p>
        </div>
        <SyncButton payoutId={id} />
      </div>

      {transactions.length === 0 ? (
        <p className="text-gray-400">
          No transactions loaded. Run a sync to pull order details.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Gross</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Fee</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Net</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">QBO Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-900">
                    {txn.order_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{txn.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{txn.company_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    £{Number(txn.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    £{Number(txn.fee).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    £{Number(txn.net).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        paymentStatusColors[txn.payment_status] ??
                        "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {txn.payment_status}
                    </span>
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
