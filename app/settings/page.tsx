export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUser } from '@/lib/auth/staff'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ConnectedBanner from './ConnectedBanner'
import SettingsTabs from './SettingsTabs'

interface LogEntry {
  id: string
  created_at: string
  action: string
  payouts: { payout_date: string } | null
  status: string
  details: Record<string, unknown> | null
}

async function getSettingsData() {
  try {
    const db = createServiceClient()
    const [shopifyRes, qboRes, logsRes] = await Promise.all([
      db.from('shopify_connections').select('store_domain, created_at').limit(1).single(),
      db
        .from('qbo_connections')
        .select(
          'company_name, token_expires_at, refresh_token_expires_at, shopify_fees_account_id, bank_account_id'
        )
        .limit(1)
        .single(),
      db
        .from('sync_log')
        .select('*, payouts(payout_date)')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    return {
      shopify: shopifyRes.data,
      qbo: qboRes.data as {
        company_name: string | null
        token_expires_at: string
        refresh_token_expires_at: string | null
        shopify_fees_account_id: string | null
        bank_account_id: string | null
      } | null,
      logs: (logsRes.data ?? []) as LogEntry[],
    }
  } catch {
    return { shopify: null, qbo: null, logs: [] }
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; qbo?: string }>
}) {
  const staff = await getStaffUser()
  if (!staff || staff.role !== 'admin') {
    redirect('/')
  }

  const { tab } = await searchParams
  const { shopify, qbo, logs } = await getSettingsData()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Settings</h2>
        <p className="mt-1 text-sm text-secondary">Connections, promotions, shipping, and activity log</p>
      </div>

      <Suspense>
        <ConnectedBanner />
      </Suspense>

      <SettingsTabs
        shopify={shopify}
        qbo={qbo}
        logs={logs}
        initialTab={tab}
      />
    </div>
  )
}
