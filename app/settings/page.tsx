export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import DisconnectButton from './DisconnectButton'
import AccountsModal from './AccountsModal'
import { Suspense } from 'react'
import ConnectedBanner from './ConnectedBanner'

type QboSettingsRow = {
  company_name: string | null
  token_expires_at: string
  refresh_token_expires_at: string | null
  shopify_fees_account_id: string | null
  bank_account_id: string | null
}

async function getConnections() {
  try {
    const db = createServiceClient()
    const [shopifyRes, qboRes] = await Promise.all([
      db.from('shopify_connections').select('store_domain, created_at').limit(1).single(),
      db
        .from('qbo_connections')
        .select(
          'company_name, token_expires_at, refresh_token_expires_at, shopify_fees_account_id, bank_account_id'
        )
        .limit(1)
        .single(),
    ])
    return {
      shopify: shopifyRes.data,
      qbo: qboRes.data as QboSettingsRow | null,
    }
  } catch {
    return { shopify: null, qbo: null }
  }
}

function formatExpiry(isoDate: string | null): { text: string; urgent: boolean } {
  if (!isoDate) return { text: 'Unknown', urgent: true }

  const days = Math.floor(
    (new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  if (days < 0)  return { text: 'Expired',          urgent: true  }
  if (days === 0) return { text: 'Expires today',    urgent: true  }
  if (days === 1) return { text: 'Expires tomorrow', urgent: true  }
  if (days <= 7)  return { text: `Expires in ${days} days`, urgent: true  }
  return             { text: `Expires in ${days} days`, urgent: false }
}

export default async function SettingsPage() {
  const { shopify, qbo } = await getConnections()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Settings</h2>
        <p className="mt-1 text-sm text-secondary">Manage your Shopify and QBO connections</p>
      </div>

      {/* QBO connected/error banner (shown after OAuth redirect) */}
      <Suspense>
        <ConnectedBanner />
      </Suspense>

      <div className="space-y-5 max-w-2xl">
        {/* Shopify Connection */}
        <div className="bg-surface border border-edge rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">Shopify</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                shopify
                  ? 'bg-ok/10 text-ok border border-ok/25'
                  : 'bg-overlay text-secondary border border-edge'
              }`}
            >
              {shopify ? '● Connected' : '○ Not connected'}
            </span>
          </div>
          {shopify ? (
            <p className="text-sm text-secondary">
              Store:{' '}
              <span className="font-mono text-primary">{shopify.store_domain}</span>
            </p>
          ) : (
            <div className="text-sm text-secondary space-y-2">
              <p>
                Set{' '}
                <code className="font-mono bg-overlay px-1.5 py-0.5 rounded text-primary text-xs">SHOPIFY_STORE_DOMAIN</code>
                {' '}and{' '}
                <code className="font-mono bg-overlay px-1.5 py-0.5 rounded text-primary text-xs">SHOPIFY_ACCESS_TOKEN</code>
                {' '}in your <code className="font-mono bg-overlay px-1.5 py-0.5 rounded text-primary text-xs">.env.local</code>.
              </p>
              <p>Shopify uses a Custom App access token — no OAuth required.</p>
            </div>
          )}
        </div>

        {/* QBO Connection */}
        <div className="bg-surface border border-edge rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">QuickBooks Online</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                qbo
                  ? 'bg-ok/10 text-ok border border-ok/25'
                  : 'bg-overlay text-secondary border border-edge'
              }`}
            >
              {qbo ? '● Connected' : '○ Not connected'}
            </span>
          </div>

          {qbo ? (
            <div className="text-sm text-secondary space-y-2">
              {qbo.company_name && (
                <p>
                  Company: <span className="text-primary">{qbo.company_name}</span>
                </p>
              )}

              {(() => {
                const expiry = formatExpiry(qbo.refresh_token_expires_at)
                return (
                  <p className="flex items-center gap-2">
                    <span>Refresh token:</span>
                    <span className={`font-medium ${expiry.urgent ? 'text-warn' : 'text-ok'}`}>
                      {expiry.urgent && '⚠ '}{expiry.text}
                    </span>
                  </p>
                )
              })()}

              <div className="pt-1 space-y-1.5">
                <p className="flex items-center gap-2">
                  <span className="text-xs text-secondary w-36">Shopify Fees account</span>
                  {qbo.shopify_fees_account_id ? (
                    <span className="font-mono text-primary text-xs">{qbo.shopify_fees_account_id}</span>
                  ) : (
                    <span className="text-warn text-xs">Not mapped</span>
                  )}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-xs text-secondary w-36">Bank / Receipt account</span>
                  {qbo.bank_account_id ? (
                    <span className="font-mono text-primary text-xs">{qbo.bank_account_id}</span>
                  ) : (
                    <span className="text-warn text-xs">Not mapped</span>
                  )}
                </p>
              </div>

              <div className="pt-3 flex gap-2 flex-wrap">
                <AccountsModal />
                <DisconnectButton />
              </div>
            </div>
          ) : (
            <div className="text-sm text-secondary space-y-3">
              <p>Connect your QuickBooks Online account to start syncing.</p>
              <a
                href="/api/qbo/auth"
                className="inline-block px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-hi transition-colors"
              >
                Connect QuickBooks
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
