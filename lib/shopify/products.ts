import { shopifyFetch } from './client'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ShopifyVariantInput {
  price: string
  sku: string
  requires_shipping: boolean
  weight?: number
  weight_unit?: 'kg'
}

interface ShopifyProductInput {
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags: string
  status: 'draft' | 'active'
  variants: ShopifyVariantInput[]
  metafields?: { namespace: string; key: string; value: string; type: string }[]
}

interface ShopifyImage {
  id: number
  position: number
  src: string
}

interface ShopifyProduct {
  id: number
  title: string
  status: string
  variants: { id: number; sku: string; price: string }[]
  images: ShopifyImage[]
}

/* ------------------------------------------------------------------ */
/* Create a draft product in Shopify                                   */
/* ------------------------------------------------------------------ */

export async function createShopifyProduct(params: {
  sku: string
  title: string
  condition: 'new' | 'used'
  sellingPrice: number
  productType: string
  vendor: string
  tags: string[]
  shippingTier: number
  widthCm: number
  heightCm: number
  depthCm: number
  weightKg: number | null
}): Promise<{ shopifyProductId: number }> {
  const {
    sku, title, condition, sellingPrice, productType,
    vendor, tags, shippingTier, widthCm, heightCm, depthCm, weightKg,
  } = params

  const fullTitle = `${title} (${sku})`

  // Build description from specs
  const descParts = [title]
  if (condition) descParts.push(`Condition: ${condition === 'new' ? 'New' : 'Used'}`)
  descParts.push(`Dimensions: ${widthCm}W x ${heightCm}H x ${depthCm}D cm`)
  if (weightKg) descParts.push(`Weight: ${weightKg}kg`)

  const product: ShopifyProductInput = {
    title: fullTitle,
    body_html: descParts.join('<br>'),
    vendor,
    product_type: productType,
    tags: [...tags, condition === 'new' ? 'New' : 'Used'].join(', '),
    status: 'draft',
    variants: [
      {
        price: sellingPrice.toFixed(2),
        sku,
        requires_shipping: true,
        ...(weightKg ? { weight: weightKg, weight_unit: 'kg' as const } : {}),
      },
    ],
    metafields: [
      { namespace: 'nce', key: 'condition', value: condition, type: 'single_line_text_field' },
      { namespace: 'nce', key: 'shipping_tier', value: String(shippingTier), type: 'number_integer' },
    ],
  }

  console.log('[shopify] Creating draft product:', sku, fullTitle)
  const result = await shopifyFetch<{ product: ShopifyProduct }>('/products.json', {
    method: 'POST',
    body: JSON.stringify({ product }),
  })

  console.log('[shopify] Product created:', sku, '→ id', result.product.id)
  return { shopifyProductId: result.product.id }
}

/* ------------------------------------------------------------------ */
/* Add a product to collections                                        */
/* ------------------------------------------------------------------ */

export async function addProductToCollections(
  productId: number,
  collectionIds: string[]
): Promise<void> {
  for (const collectionId of collectionIds) {
    try {
      await shopifyFetch('/collects.json', {
        method: 'POST',
        body: JSON.stringify({
          collect: { product_id: productId, collection_id: parseInt(collectionId, 10) },
        }),
      })
    } catch (e) {
      console.error(`Failed to add product ${productId} to collection ${collectionId}:`, e)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Upload images to a product                                          */
/* ------------------------------------------------------------------ */

export async function uploadProductImage(
  productId: number,
  imageBase64: string,
  filename: string,
  position: number
): Promise<{ shopifyImageId: number }> {
  console.log(`[shopify] Uploading image to product ${productId}: ${filename} (pos ${position}, ${(imageBase64.length / 1024).toFixed(0)}KB base64)`)
  const result = await shopifyFetch<{ image: ShopifyImage }>(
    `/products/${productId}/images.json`,
    {
      method: 'POST',
      body: JSON.stringify({
        image: {
          attachment: imageBase64,
          filename,
          position,
        },
      }),
    }
  )

  console.log(`[shopify] Image uploaded: ${filename} → imageId ${result.image.id}`)
  return { shopifyImageId: result.image.id }
}

/* ------------------------------------------------------------------ */
/* Set product status (draft → active)                                 */
/* ------------------------------------------------------------------ */

export async function updateProductStatus(
  productId: number,
  status: 'draft' | 'active'
): Promise<void> {
  console.log(`[shopify] Updating product ${productId} status → ${status}`)
  await shopifyFetch(`/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: productId, status } }),
  })
  console.log(`[shopify] Product ${productId} status updated to ${status}`)
}

/* ------------------------------------------------------------------ */
/* Fetch product types, vendors, collections for dropdowns             */
/* ------------------------------------------------------------------ */

export async function fetchProductMetadata(): Promise<{
  productTypes: string[]
  vendors: string[]
  collections: { id: string; title: string }[]
}> {
  try {
    const [productsData, collectionsData] = await Promise.all([
      shopifyFetch<{ products: { product_type: string; vendor: string }[] }>(
        '/products.json?limit=250&fields=product_type,vendor'
      ),
      shopifyFetch<{ custom_collections: { id: number; title: string }[] }>(
        '/custom_collections.json?limit=250&fields=id,title'
      ),
    ])

    const products = productsData.products || []
    const productTypes = [...new Set(products.map((p) => p.product_type).filter(Boolean))].sort()
    const vendors = [...new Set(products.map((p) => p.vendor).filter(Boolean))].sort()
    const collections = (collectionsData.custom_collections || []).map((c) => ({
      id: String(c.id),
      title: c.title,
    }))

    return { productTypes, vendors, collections }
  } catch (e) {
    console.error('Failed to fetch Shopify metadata:', e)
    return { productTypes: [], vendors: [], collections: [] }
  }
}
