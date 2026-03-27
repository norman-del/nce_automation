export const dynamic = 'force-dynamic'

import { createServiceClient } from "@/lib/supabase/client";

async function getSyncLog() {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("sync_log")
      .select("*, payouts(payout_date)")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  } catch {
    return [];
  }
}

const statusColors: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export default async function SyncLogPage() {
  const logs = await getSyncLog();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Sync Log</h2>
        <p className="mt-1 text-sm text-gray-500">Audit trail of all sync actions</p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No sync activity yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Payout Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log: {
                id: string;
                created_at: string;
                action: string;
                payouts: { payout_date: string } | null;
                status: string;
                details: Record<string, unknown> | null;
              }) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{log.action}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.payouts?.payout_date ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[log.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate font-mono text-xs">
                    {log.details ? JSON.stringify(log.details) : "—"}
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
