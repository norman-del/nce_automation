/**
 * Shopify sync toggle — controls whether product operations push to Shopify.
 * Set SHOPIFY_SYNC_ENABLED=false in env to disable all Shopify API writes.
 */
export function isShopifySyncEnabled(): boolean {
  return process.env.SHOPIFY_SYNC_ENABLED !== 'false'
}
