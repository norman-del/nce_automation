export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import { fetchProductMetadata } from '@/lib/shopify/products'
import { notFound, redirect } from 'next/navigation'
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

  // Only allow editing while processing
  if (product.status !== 'processing') {
    redirect(`/products/${id}`)
  }

  const { productTypes, vendors, collections } = await fetchProductMetadata()

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
        collections={collections}
      />
    </div>
  )
}
