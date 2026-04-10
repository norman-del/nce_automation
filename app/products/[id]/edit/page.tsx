export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import { fetchProductMetadata } from '@/lib/shopify/products'
import { notFound } from 'next/navigation'
import EditProductForm from './EditProductForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  const db = createServiceClient()

  const { data: product, error } = await db
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !product) notFound()

  const { productTypes, vendors } = await fetchProductMetadata()

  // Resolve collection IDs to { id, title } for the typeahead
  const collectionIds: string[] = product.collections || []
  let initialCollections: { id: string; title: string }[] = []
  if (collectionIds.length > 0) {
    const { data: cols } = await db
      .from('collections')
      .select('shopify_id, title')
      .in('shopify_id', collectionIds.map(Number))
    initialCollections = (cols || []).map((c: { shopify_id: number; title: string }) => ({
      id: String(c.shopify_id),
      title: c.title,
    }))
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Edit Product</h2>
        <p className="mt-1 text-sm text-secondary font-mono">{product.sku}</p>
      </div>
      <EditProductForm
        product={product}
        productTypes={productTypes}
        vendors={vendors}
        initialCollections={initialCollections}
      />
    </div>
  )
}
