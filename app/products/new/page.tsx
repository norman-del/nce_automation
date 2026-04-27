export const dynamic = 'force-dynamic'

import ProductForm from './ProductForm'
import { fetchProductMetadataFromSupabase } from '@/lib/products/metadata'
import { fetchDeliveryProfiles } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

export default async function NewProductPage() {
  const [{ productTypes, vendors }, deliveryProfiles] = await Promise.all([
    fetchProductMetadataFromSupabase(),
    isShopifySyncEnabled() ? fetchDeliveryProfiles() : Promise.resolve([]),
  ])

  return (
    <div>
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
