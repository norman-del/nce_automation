export const dynamic = 'force-dynamic'

import ProductFormStrategic from './ProductFormStrategic'
import { fetchProductMetadataFromSupabase } from '@/lib/products/metadata'
import { isStrategicIngestionEnabled } from '@/lib/strategic/config'
import ScopeBanner from '@/app/components/ScopeBanner'

export default async function NewProductStrategicPage() {
  const { productTypes, vendors } = await fetchProductMetadataFromSupabase()
  const enabled = isStrategicIngestionEnabled()

  return (
    <div>
      <ScopeBanner
        mode="strategic"
        detail="Post-Shopify product ingestion. Writes to Supabase + QuickBooks; photos go to Supabase Storage. No Shopify calls."
      />
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Add Product (Strategic)</h2>
        <p className="mt-1 text-sm text-secondary">
          Saves to Supabase and creates a QBO Item. Photos upload to Supabase Storage and appear on nce-site directly.
        </p>
      </div>
      <ProductFormStrategic
        productTypes={productTypes}
        vendors={vendors}
        enabled={enabled}
      />
    </div>
  )
}
