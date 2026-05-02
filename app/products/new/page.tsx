export const dynamic = 'force-dynamic'

import ProductForm from './ProductForm'
import { fetchProductMetadataFromSupabase } from '@/lib/products/metadata'
import { fetchDeliveryProfiles } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'
import ScopeBanner from '@/app/components/ScopeBanner'

export default async function NewProductPage() {
  const [{ productTypes, vendors }, deliveryProfiles] = await Promise.all([
    fetchProductMetadataFromSupabase(),
    isShopifySyncEnabled() ? fetchDeliveryProfiles() : Promise.resolve([]),
  ])

  return (
    <div>
      <ScopeBanner mode="bridge" detail="Saving here writes to Supabase, Shopify (draft), and QuickBooks. This form is retired at Shopify cutover." />
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Add Products</h2>
        <p className="mt-1 text-sm text-secondary">
          Enter product details below. Products will be saved to Supabase and pushed to Shopify (draft) and QBO.
        </p>
      </div>
      <ProductForm
        productTypes={productTypes}
        vendors={vendors}
        deliveryProfiles={deliveryProfiles}
      />
    </div>
  )
}
