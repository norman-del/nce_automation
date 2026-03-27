export const dynamic = 'force-dynamic'

import { createServiceClient } from "@/lib/supabase/client";

async function getConnections() {
  try {
    const db = createServiceClient();
    const [shopifyRes, qboRes] = await Promise.all([
      db.from("shopify_connections").select("store_domain, created_at").limit(1).single(),
      db.from("qbo_connections").select("company_name, token_expires_at, shopify_fees_account_id, bank_account_id").limit(1).single(),
    ]);
    return {
      shopify: shopifyRes.data,
      qbo: qboRes.data,
    };
  } catch {
    return { shopify: null, qbo: null };
  }
}

export default async function SettingsPage() {
  const { shopify, qbo } = await getConnections();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">Manage your Shopify and QBO connections</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Shopify Connection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Shopify</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                shopify
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {shopify ? "Connected" : "Not connected"}
            </span>
          </div>
          {shopify ? (
            <p className="text-sm text-gray-600">
              Store: <span className="font-mono">{shopify.store_domain}</span>
            </p>
          ) : (
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                Set <code className="font-mono bg-gray-100 px-1 rounded">SHOPIFY_STORE_DOMAIN</code> and{" "}
                <code className="font-mono bg-gray-100 px-1 rounded">SHOPIFY_ACCESS_TOKEN</code> in your{" "}
                <code className="font-mono bg-gray-100 px-1 rounded">.env.local</code>.
              </p>
              <p>Shopify uses a Custom App access token — no OAuth required.</p>
            </div>
          )}
        </div>

        {/* QBO Connection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">QuickBooks Online</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                qbo
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {qbo ? "Connected" : "Not connected"}
            </span>
          </div>
          {qbo ? (
            <div className="text-sm text-gray-600 space-y-1">
              {qbo.company_name && <p>Company: {qbo.company_name}</p>}
              <p>
                Token expires:{" "}
                {new Date(qbo.token_expires_at).toLocaleString("en-GB")}
              </p>
              <p>
                Shopify Fees account:{" "}
                {qbo.shopify_fees_account_id ?? (
                  <span className="text-yellow-600">Not mapped</span>
                )}
              </p>
              <p>
                Bank account:{" "}
                {qbo.bank_account_id ?? (
                  <span className="text-yellow-600">Not mapped</span>
                )}
              </p>
            </div>
          ) : (
            <div className="text-sm text-gray-500 space-y-2">
              <p>Connect your QuickBooks Online account to start syncing.</p>
              <a
                href="/api/qbo/auth"
                className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
              >
                Connect QuickBooks
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
