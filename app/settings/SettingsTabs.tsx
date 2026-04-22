'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PromotionsList from './PromotionsList'
import ShippingRatesEditor from './ShippingRatesEditor'
import CollectionsManager from './CollectionsManager'
import SpecsFieldsManager from './SpecsFieldsManager'
import SupplierFeedsManager from './SupplierFeedsManager'
import SyncLogTable from './SyncLogTable'
import AccountsModal from './AccountsModal'
import DisconnectButton from './DisconnectButton'

interface LogEntry {
  id: string
  created_at: string
  action: string
  payouts: { payout_date: string } | null
  status: string
  details: Record<string, unknown> | null
}

interface QboData {
  company_name: string | null
  token_expires_at: string
  refresh_token_expires_at: string | null
  shopify_fees_account_id: string | null
  bank_account_id: string | null
  updated_at: string | null
  last_refreshed_by: string | null
}

interface ShopifyData {
  store_domain: string
  created_at: string
}

interface Props {
  shopify: ShopifyData | null
  qbo: QboData | null
  logs: LogEntry[]
  initialTab?: string
  staffRole?: 'admin' | 'staff'
}

const allTabs = [
  { key: 'connections', label: 'Connections', staffVisible: true },
  { key: 'promotions', label: 'Promotions', staffVisible: false },
  { key: 'shipping', label: 'Shipping Rates', staffVisible: false },
  { key: 'collections', label: 'Collections', staffVisible: false },
  { key: 'specs-fields', label: 'Specs Fields', staffVisible: false },
  { key: 'supplier-feeds', label: 'Supplier Feeds', staffVisible: false },
  { key: 'activity', label: 'Activity Log', staffVisible: false },
] as const

type TabKey = (typeof allTabs)[number]['key']

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

function formatAccessTokenStatus(isoDate: string | null): { text: string; tone: 'ok' | 'warn' | 'error' } {
  if (!isoDate) return { text: 'Unknown', tone: 'error' }
  const minutesLeft = Math.round((new Date(isoDate).getTime() - Date.now()) / 60000)
  if (minutesLeft < 0)   return { text: `Expired ${Math.abs(minutesLeft)} min ago — auto-refresh on next call`, tone: 'warn' }
  if (minutesLeft < 15)  return { text: `Expires in ${minutesLeft} min — will auto-refresh`,                    tone: 'warn' }
  return                       { text: `Valid for ${minutesLeft} min`,                                          tone: 'ok'   }
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'never'
  const minutes = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000)
  if (minutes < 1)    return 'just now'
  if (minutes < 60)   return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24)     return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function SettingsTabs({ shopify, qbo, logs, initialTab, staffRole }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isAdmin = staffRole === 'admin'
  const tabs = allTabs.filter(t => isAdmin || t.staffVisible)
  const tabParam = initialTab ?? searchParams.get('tab') ?? 'connections'
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabs.some(t => t.key === tabParam) ? (tabParam as TabKey) : 'connections'
  )

  function switchTab(key: TabKey) {
    setActiveTab(key)
    router.replace(`/settings?tab=${key}`, { scroll: false })
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-edge">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'connections' && (
        <ConnectionsTab shopify={shopify} qbo={qbo} />
      )}
      {activeTab === 'promotions' && <PromotionsList />}
      {activeTab === 'shipping' && <ShippingRatesEditor />}
      {activeTab === 'collections' && <CollectionsManager />}
      {activeTab === 'specs-fields' && <SpecsFieldsManager />}
      {activeTab === 'supplier-feeds' && <SupplierFeedsManager />}
      {activeTab === 'activity' && <SyncLogTable logs={logs} />}
    </div>
  )
}

function ConnectionsTab({ shopify, qbo }: { shopify: ShopifyData | null; qbo: QboData | null }) {
  return (
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
            {shopify ? 'Connected' : 'Not connected'}
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
            {qbo ? 'Connected' : 'Not connected'}
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
              const access = formatAccessTokenStatus(qbo.token_expires_at)
              const accessClass =
                access.tone === 'ok' ? 'text-ok' : access.tone === 'warn' ? 'text-warn' : 'text-err'
              return (
                <>
                  <p className="flex items-center gap-2">
                    <span>Refresh token:</span>
                    <span className={`font-medium ${expiry.urgent ? 'text-warn' : 'text-ok'}`}>
                      {expiry.text}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span>Access token:</span>
                    <span className={`font-medium ${accessClass}`}>{access.text}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span>Last refresh:</span>
                    <span className="text-primary">
                      {formatRelativeTime(qbo.updated_at)}
                      {qbo.last_refreshed_by ? ` (${qbo.last_refreshed_by})` : ' (manual reconnect)'}
                    </span>
                  </p>
                </>
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
  )
}
