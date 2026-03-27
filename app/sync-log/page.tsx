export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import SyncLogTable from './SyncLogTable'

interface LogEntry {
  id: string
  created_at: string
  action: string
  payouts: { payout_date: string } | null
  status: string
  details: Record<string, unknown> | null
}

async function getSyncLog() {
  try {
    const db = createServiceClient()
    const { data } = await db
      .from('sync_log')
      .select('*, payouts(payout_date)')
      .order('created_at', { ascending: false })
      .limit(200)
    return (data ?? []) as LogEntry[]
  } catch {
    return []
  }
}

export default async function SyncLogPage() {
  const logs = await getSyncLog()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Sync Log</h2>
        <p className="mt-1 text-sm text-secondary">
          Audit trail of all sync actions — {logs.length} entries
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-secondary">No sync activity yet.</div>
      ) : (
        <SyncLogTable logs={logs} />
      )}
    </div>
  )
}
