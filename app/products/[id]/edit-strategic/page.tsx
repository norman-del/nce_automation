export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import { fetchProductMetadataFromSupabase } from '@/lib/products/metadata'
import { notFound, redirect } from 'next/navigation'
import EditFormStrategic from './EditFormStrategic'
import PhotosManagerStrategic, { type StrategicPhoto } from './PhotosManagerStrategic'
import MetafieldsEditor from '../edit/MetafieldsEditor'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditStrategicPage({ params }: Props) {
  const { id } = await params
  const db = createServiceClient()

  const { data: product, error } = await db
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !product) notFound()

  // Belt-and-braces: bridge products belong on the bridge edit page.
  if (product.shopify_product_id) {
    redirect(`/products/${id}/edit`)
  }

  const { productTypes, vendors } = await fetchProductMetadataFromSupabase()

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

  // Photos for this product, from product_images (Supabase Storage URLs)
  const { data: imageRows } = await db
    .from('product_images')
    .select('id, src, file_name, alt_text, position')
    .eq('product_id', id)
    .order('position')

  const photos: StrategicPhoto[] = (imageRows ?? []).map((r) => ({
    id: r.id as string,
    src: (r.src as string) ?? '',
    fileName: (r.file_name as string) ?? '',
    altText: (r.alt_text as string | null) ?? null,
    position: (r.position as number) ?? 0,
  }))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-primary">Edit Product</h2>
        <p className="mt-1 text-sm text-secondary font-mono">{product.sku}</p>
        <p className="mt-2 text-xs text-emerald-300/80">
          Strategic — writes to Supabase + QuickBooks. No Shopify call.
        </p>
      </div>

      <EditFormStrategic
        product={product}
        productTypes={productTypes}
        vendors={vendors}
        initialCollections={initialCollections}
      />

      <div className="mt-8 bg-surface border border-edge rounded-lg p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Photos</h3>
        <PhotosManagerStrategic productId={product.id} sku={product.sku} initial={photos} />
      </div>

      <div className="mt-8 bg-surface border border-edge rounded-lg p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Specs</h3>
        <MetafieldsEditor productId={product.id} />
      </div>
    </div>
  )
}
