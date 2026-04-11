import { createServiceClient } from '@/lib/supabase/client'

/**
 * Fetch product types, vendors, and collections from Supabase.
 * Always reads from the database — no Shopify dependency.
 */
export async function fetchProductMetadataFromSupabase(): Promise<{
  productTypes: string[]
  vendors: string[]
  collections: { id: string; title: string }[]
}> {
  const db = createServiceClient()

  const [typesRes, vendorsRes, collectionsRes] = await Promise.all([
    db
      .from('products')
      .select('product_type')
      .not('product_type', 'is', null)
      .not('product_type', 'eq', ''),
    db
      .from('products')
      .select('vendor')
      .not('vendor', 'is', null)
      .not('vendor', 'eq', ''),
    db
      .from('collections')
      .select('shopify_id, title')
      .eq('collection_type', 'custom')
      .order('title'),
  ])

  const productTypes = [
    ...new Set(
      (typesRes.data ?? []).map((r: { product_type: string }) => r.product_type)
    ),
  ].sort()

  const vendors = [
    ...new Set(
      (vendorsRes.data ?? []).map((r: { vendor: string }) => r.vendor)
    ),
  ].sort()

  const collections = (collectionsRes.data ?? []).map(
    (c: { shopify_id: number; title: string }) => ({
      id: String(c.shopify_id),
      title: c.title,
    })
  )

  return { productTypes, vendors, collections }
}
