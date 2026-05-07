export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PhotoUploadWrapper from './PhotoUploadWrapper'
import PhotoGallery, { type GalleryImage } from './PhotoGallery'
import RetrySyncButton from './RetrySyncButton'
import DeleteProductButton from './DeleteProductButton'
import StockManager from './StockManager'
import { listProductImages } from '@/lib/shopify/products'
import { isShopifySyncEnabled } from '@/lib/shopify/config'

interface Props {
  params: Promise<{ id: string }>
}

const SHIPPING_LABELS: Record<number, string> = { 0: 'Parcel', 1: 'Single Pallet', 2: 'Double Pallet' }

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params
  const db = createServiceClient()

  const { data: product, error } = await db
    .from('products')
    .select('*, suppliers(*)')
    .eq('id', id)
    .single()

  if (error || !product) notFound()

  const { data: images } = await db
    .from('product_images')
    .select('*')
    .eq('product_id', id)
    .order('position')

  // For the live thumbnail gallery we need URLs. For bridge products we fetch
  // them from Shopify and merge with the DB rows. For strategic products
  // (no shopify_product_id) the URLs are already on product_images.src
  // (Supabase Storage public URL).
  const isStrategic = !product.shopify_product_id
  // Read-only thumbnails for strategic on the detail page; full management
  // (upload/reorder/delete) lives on the edit-strategic page.
  const strategicThumbnails = isStrategic
    ? (images ?? []).map((i) => ({
        id: i.id as string,
        src: (i.src as string) ?? '',
        fileName: (i.file_name as string) ?? '',
      }))
    : []
  let galleryImages: GalleryImage[] = []
  if (!isStrategic && isShopifySyncEnabled() && product.shopify_product_id) {
    try {
      const shopifyImages = await listProductImages(product.shopify_product_id)
      const dbByShopifyId = new Map(
        (images ?? [])
          .filter((i) => i.shopify_image_id)
          .map((i) => [
            Number(i.shopify_image_id),
            { fileName: i.file_name as string, altText: (i.alt_text as string | null) ?? null },
          ])
      )
      galleryImages = shopifyImages.map((img) => {
        const meta = dbByShopifyId.get(img.id)
        return {
          shopifyImageId: img.id,
          src: img.src,
          fileName: meta?.fileName || `image-${img.id}.jpg`,
          altText: meta?.altText ?? null,
          position: img.position,
        }
      })
    } catch (e) {
      console.warn('[product/page] listProductImages failed:', String(e))
    }
  }

  const labelCls = 'text-xs text-secondary'
  const valueCls = 'text-sm text-primary'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/products" className="text-secondary hover:text-accent text-sm">&larr; Products</Link>
          </div>
          <h2 className="text-2xl font-semibold text-primary">{product.title}</h2>
          <p className="mt-1 text-sm text-secondary font-mono">{product.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
            product.status === 'active'
              ? 'bg-ok/10 text-ok border-ok/25'
              : 'bg-warn/10 text-warn border-warn/25'
          }`}>
            {product.status}
          </span>
          <Link
            href={`/products/${product.id}/${isStrategic ? 'edit-strategic' : 'edit'}`}
            className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/25 rounded-md hover:bg-accent/10 transition-colors"
          >
            Edit
          </Link>
          <DeleteProductButton productId={product.id} sku={product.sku} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — details */}
        <div className="space-y-5">
          {/* Product Details */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Product Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={labelCls}>Condition</p><p className={`${valueCls} capitalize`}>{product.condition}</p></div>
              <div><p className={labelCls}>VAT</p><p className={valueCls}>{product.vat_applicable ? '20% Standard' : 'Margin Scheme'}</p></div>
              <div><p className={labelCls}>Cost Price</p><p className={valueCls}>£{Number(product.cost_price).toFixed(2)}</p></div>
              <div><p className={labelCls}>Selling Price</p><p className={valueCls}>£{Number(product.selling_price).toFixed(2)}</p></div>
            </div>
          </div>

          {/* Model & Specs */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Model & Specs</h3>
            <div className="grid grid-cols-2 gap-3">
              {product.model_number && <div><p className={labelCls}>Model Number</p><p className={valueCls}>{product.model_number}</p></div>}
              {product.year_of_manufacture && <div><p className={labelCls}>Year</p><p className={valueCls}>{product.year_of_manufacture}</p></div>}
              {product.electrical_requirements && <div><p className={labelCls}>Electrical</p><p className={valueCls}>{product.electrical_requirements}</p></div>}
              {product.original_rrp && <div><p className={labelCls}>Original RRP</p><p className={valueCls}>£{Number(product.original_rrp).toFixed(2)}</p></div>}
            </div>
            {product.notes && <div><p className={labelCls}>Notes</p><p className={`${valueCls} mt-1`}>{product.notes}</p></div>}
            {product.body_html && <div><p className={labelCls}>Description</p><p className={`${valueCls} mt-1 whitespace-pre-wrap`}>{product.body_html}</p></div>}
          </div>

          {/* Dimensions */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Dimensions & Shipping</h3>
            <div className="grid grid-cols-4 gap-3">
              <div><p className={labelCls}>Width</p><p className={valueCls}>{product.width_cm} cm</p></div>
              <div><p className={labelCls}>Height</p><p className={valueCls}>{product.height_cm} cm</p></div>
              <div><p className={labelCls}>Depth</p><p className={valueCls}>{product.depth_cm} cm</p></div>
              <div><p className={labelCls}>Weight</p><p className={valueCls}>{product.weight_kg ? `${product.weight_kg} kg` : '—'}</p></div>
            </div>
            <div><p className={labelCls}>Shipping Tier</p><p className={valueCls}>{SHIPPING_LABELS[product.shipping_tier] || product.shipping_tier}</p></div>
          </div>

          {/* Classification */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Classification</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={labelCls}>Product Type</p><p className={valueCls}>{product.product_type}</p></div>
              <div><p className={labelCls}>Vendor / Brand</p><p className={valueCls}>{product.vendor}</p></div>
            </div>
            {product.tags?.length > 0 && (
              <div>
                <p className={labelCls}>Tags</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.tags.map((tag: string) => (
                    <span key={tag} className="px-2 py-0.5 bg-overlay border border-edge rounded text-xs text-secondary">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Supplier */}
          {(product.qbo_vendor_name || product.suppliers) && (
            <div className="bg-surface border border-edge rounded-lg p-5 space-y-2">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Supplier</h3>
              <p className={valueCls}>{product.qbo_vendor_name || product.suppliers?.name}</p>
              {product.qbo_vendor_id && <p className="text-xs text-secondary">QBO Vendor #{product.qbo_vendor_id}</p>}
            </div>
          )}
        </div>

        {/* Right column — inventory, sync status, photos */}
        <div className="space-y-5">
          {/* Inventory */}
          <StockManager
            productId={product.id}
            stockQuantity={product.stock_quantity ?? 0}
            lowStockThreshold={product.low_stock_threshold ?? 1}
          />

          {/* Sync Status */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Sync Status</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary">Shopify</span>
                {product.shopify_product_id ? (
                  <span className="text-sm text-ok">Synced (#{product.shopify_product_id})</span>
                ) : (
                  <span className="text-sm text-warn">Not synced</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary">QuickBooks</span>
                {product.qbo_synced ? (
                  <span className="text-sm text-ok">Synced (#{product.qbo_item_id})</span>
                ) : (
                  <span className="text-sm text-warn">Not synced</span>
                )}
              </div>
              {product.sync_error && (
                <div className="bg-fail/10 border border-fail/25 rounded-md px-3 py-2 text-xs text-fail">
                  {product.sync_error}
                </div>
              )}
              <RetrySyncButton
                productId={product.id}
                sku={product.sku}
                hasShopify={!!product.shopify_product_id}
                hasQbo={!!product.qbo_synced}
              />
            </div>
          </div>

          {/* Photos */}
          <div className="bg-surface border border-edge rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Photos</h3>

            {isStrategic ? (
              <>
                {strategicThumbnails.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {strategicThumbnails.map((img, idx) => (
                      <div key={img.id} className="relative bg-overlay border border-edge rounded-md overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt={img.fileName} className="w-full aspect-square object-cover" />
                        {idx === 0 && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-medium bg-accent text-white rounded">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-secondary">No images recorded</p>
                )}
                <Link
                  href={`/products/${product.id}/edit-strategic`}
                  className="inline-block text-xs text-accent hover:underline"
                >
                  Manage photos →
                </Link>
              </>
            ) : (
              <>
                <PhotoGallery productId={product.id} initial={galleryImages} />
                <PhotoUploadWrapper
                  productId={product.id}
                  hasShopifyId={!!product.shopify_product_id}
                />
                {galleryImages.length === 0 && product.status === 'active' && (
                  <p className="text-xs text-secondary">No images recorded</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
