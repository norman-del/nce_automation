import { shopifyFetch, shopifyGraphQL } from './client'
import { plainTextToHtml } from './format'

/* ------------------------------------------------------------------ */
/* Multi-channel publishing via GraphQL publishablePublish             */
/*                                                                     */
/* Replaces the broken REST loop that PUT'd to /product_listings       */
/* without referencing each publication. publishablePublish is the     */
/* modern API that actually publishes to all sales channels (Online    */
/* Store, Shop app, POS, Google, etc.) in a single call.               */
/* Requires the write_publications scope (see shopify.app.toml).       */
/* ------------------------------------------------------------------ */

async function publishToAllChannels(productIdNumeric: number): Promise<void> {
  // Fetch all publications (sales channels) the store has
  const pubResp = await shopifyFetch<{ publications: { id: number; name: string }[] }>(
    '/publications.json'
  )
  const rawPublications = pubResp.publications ?? []
  if (rawPublications.length === 0) {
    console.warn('[shopify] No publications returned — nothing to publish to')
    return
  }

  // Dedupe by id — REST /publications.json can return the same channel twice
  // (e.g. two POS entries, three Google & YouTube entries).
  const seen = new Set<number>()
  const publications = rawPublications.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  const productGid = `gid://shopify/Product/${productIdNumeric}`

  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable { ... on Product { id } }
        userErrors { field message }
      }
    }
  `

  // Call per-publication. publishablePublish stops applying inputs after the
  // first userError, so batching fails silently when any channel is invalid
  // (e.g. Shopify Inbox isn't a valid product publication target — it errors
  // and blocks every channel listed after it in the input array).
  const published: string[] = []
  const skipped: string[] = []
  for (const p of publications) {
    try {
      const data = await shopifyGraphQL<{
        publishablePublish: {
          publishable: { id: string } | null
          userErrors: { field: string[]; message: string }[]
        }
      }>(mutation, {
        id: productGid,
        input: [{ publicationId: `gid://shopify/Publication/${p.id}` }],
      })
      const errs = data.publishablePublish.userErrors
      if (errs && errs.length) {
        skipped.push(`${p.name}(${errs.map(e => e.message).join(';')})`)
      } else {
        published.push(p.name)
      }
    } catch (e) {
      skipped.push(`${p.name}(${String(e)})`)
    }
  }
  console.log(
    `[shopify] Published ${productGid} to ${published.length}/${publications.length} channel(s): ${published.join(', ')}` +
      (skipped.length ? ` | skipped: ${skipped.join(', ')}` : '')
  )
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ShopifyVariantInput {
  price: string
  sku: string
  requires_shipping: boolean
  taxable: boolean
  weight: number
  weight_unit: 'kg'
  inventory_management: 'shopify'
  inventory_policy: 'deny'
  inventory_quantity?: number
}

interface ShopifyProductInput {
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags: string
  status: 'draft' | 'active'
  published_scope: 'web' | 'global'
  published: boolean
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
  vatApplicable: boolean
  sellingPrice: number
  productType: string
  vendor: string
  tags: string[]
  shippingTier: number
  widthCm: number
  heightCm: number
  depthCm: number
  weightKg: number | null
  notes?: string | null
  bodyHtml?: string | null
}): Promise<{ shopifyProductId: number; shopifyVariantId: number | null }> {
  const {
    sku, title, condition, vatApplicable, sellingPrice, productType,
    vendor, tags, shippingTier, widthCm, heightCm, depthCm, notes, bodyHtml,
  } = params

  const fullTitle = `${title} (NCE${sku})`

  // Use explicit description if provided, otherwise build from specs.
  // plainTextToHtml preserves paragraph breaks (\n\n) by wrapping in <p>,
  // so the Shopify PDP renders them like the admin typed them.
  let description: string
  if (bodyHtml) {
    description = plainTextToHtml(bodyHtml)
  } else {
    const descParts: string[] = []
    if (notes) descParts.push(notes)
    descParts.push(title)
    if (condition) descParts.push(`Condition: ${condition === 'new' ? 'New' : 'Used'}`)
    descParts.push(`Dimensions: ${widthCm}W x ${heightCm}H x ${depthCm}D cm`)
    description = plainTextToHtml(descParts.join('\n\n'))
  }

  const product: ShopifyProductInput = {
    title: fullTitle,
    body_html: description,
    vendor,
    product_type: productType,
    tags: [...tags, condition === 'new' ? 'New' : 'Used'].join(', '),
    status: 'draft',
    published_scope: 'global',
    published: true,
    variants: [
      {
        price: sellingPrice.toFixed(2),
        sku,
        requires_shipping: true,
        taxable: vatApplicable, // charge tax only for 20% VAT, not margin scheme
        weight: shippingTier, // 0=Parcel, 1=Single Pallet, 2=Double Pallet
        weight_unit: 'kg',
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        inventory_quantity: 1, // NCE sells single-piece used equipment; seed 1 unit
      },
    ],
    metafields: [
      { namespace: 'nce', key: 'condition', value: condition, type: 'single_line_text_field' },
      { namespace: 'nce', key: 'shipping_tier', value: String(shippingTier), type: 'number_integer' },
      // Theme label — shown as a badge on the product card (e.g. "USED", "NEW")
      { namespace: 'theme', key: 'label', value: condition.toUpperCase(), type: 'single_line_text_field' },
      // Condition metafield — used by Shopify for product condition display
      { namespace: 'custom', key: 'condition-new-used', value: JSON.stringify([condition === 'used' ? 'Used \u2013 Good' : 'New']), type: 'list.single_line_text_field' },
      // Dimensions metafield
      { namespace: 'custom', key: 'dimensions', value: `${widthCm}cm width x ${heightCm}cm height x ${depthCm}cm depth`, type: 'single_line_text_field' },
    ],
  }

  console.log('[shopify] Creating draft product:', sku, fullTitle)
  const result = await shopifyFetch<{ product: ShopifyProduct }>('/products.json', {
    method: 'POST',
    body: JSON.stringify({ product }),
  })

  const productId = result.product.id
  console.log('[shopify] Product created:', sku, '→ id', productId)

  // Publish to all sales channels. Products are still 'draft' at this point,
  // so channels won't actually show them until status flips to 'active' on
  // photo upload — but registering the publication now means the flip-to-active
  // becomes visible everywhere automatically.
  try {
    await publishToAllChannels(productId)
  } catch (pubErr) {
    console.warn('[shopify] publishToAllChannels failed (non-fatal):', String(pubErr))
  }

  const variantId = result.product.variants?.[0]?.id ?? null
  return { shopifyProductId: productId, shopifyVariantId: variantId }
}

/* ------------------------------------------------------------------ */
/* Update an existing product in Shopify                               */
/* ------------------------------------------------------------------ */

export async function updateShopifyProduct(
  shopifyProductId: number,
  params: {
    sku: string
    title: string
    condition: 'new' | 'used'
    vatApplicable: boolean
    sellingPrice: number
    productType: string
    vendor: string
    tags: string[]
    shippingTier: number
    widthCm: number
    heightCm: number
    depthCm: number
    weightKg: number | null
    notes?: string | null
    bodyHtml?: string | null
  }
): Promise<void> {
  const {
    sku, title, condition, vatApplicable, sellingPrice, productType,
    vendor, tags, shippingTier, widthCm, heightCm, depthCm, notes, bodyHtml,
  } = params

  const fullTitle = `${title} (NCE${sku})`

  let description: string
  if (bodyHtml) {
    description = plainTextToHtml(bodyHtml)
  } else {
    const descParts: string[] = []
    if (notes) descParts.push(notes)
    descParts.push(title)
    if (condition) descParts.push(`Condition: ${condition === 'new' ? 'New' : 'Used'}`)
    descParts.push(`Dimensions: ${widthCm}W x ${heightCm}H x ${depthCm}D cm`)
    description = plainTextToHtml(descParts.join('\n\n'))
  }

  // Get existing product to find variant ID
  const existing = await shopifyFetch<{ product: ShopifyProduct }>(
    `/products/${shopifyProductId}.json?fields=id,variants`
  )
  const variantId = existing.product.variants[0]?.id

  const productUpdate: Record<string, unknown> = {
    id: shopifyProductId,
    title: fullTitle,
    body_html: description,
    vendor,
    product_type: productType,
    tags: [...tags, condition === 'new' ? 'New' : 'Used'].join(', '),
  }

  if (variantId) {
    productUpdate.variants = [{
      id: variantId,
      price: sellingPrice.toFixed(2),
      sku,
      requires_shipping: true,
      taxable: vatApplicable,
      weight: shippingTier,
      weight_unit: 'kg',
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      // no inventory_quantity — preserves current stock count on edits
    }]
  }

  console.log('[shopify] Updating product:', sku, shopifyProductId)
  await shopifyFetch(`/products/${shopifyProductId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: productUpdate }),
  })
  console.log('[shopify] Product updated:', sku, '→ id', shopifyProductId)
}

/* ------------------------------------------------------------------ */
/* Delete a product from Shopify                                       */
/* ------------------------------------------------------------------ */

export async function deleteShopifyProduct(productId: number): Promise<void> {
  console.log(`[shopify] Deleting product ${productId}`)
  await shopifyFetch(`/products/${productId}.json`, { method: 'DELETE' })
  console.log(`[shopify] Product ${productId} deleted`)
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

// Fetch the current image list (id, position, src) for a Shopify product.
// Sorted by position ascending.
export async function listProductImages(
  productId: number
): Promise<{ id: number; position: number; src: string }[]> {
  const result = await shopifyFetch<{
    images: { id: number; position: number; src: string }[]
  }>(`/products/${productId}/images.json`)
  return (result.images ?? []).slice().sort((a, b) => a.position - b.position)
}

// Update the position of one image. Shopify shifts other images automatically
// when positions collide, but we always pass the full target order in our
// reorder endpoint so callers shouldn't see surprising shuffles.
export async function updateProductImagePosition(
  productId: number,
  imageId: number,
  position: number
): Promise<void> {
  await shopifyFetch(`/products/${productId}/images/${imageId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ image: { id: imageId, position } }),
  })
}

export async function deleteProductImage(
  productId: number,
  imageId: number
): Promise<void> {
  await shopifyFetch(`/products/${productId}/images/${imageId}.json`, {
    method: 'DELETE',
  })
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
    body: JSON.stringify({ product: { id: productId, status, published: true, published_scope: 'global' } }),
  })

  // Re-publish to all channels on activation — belt-and-braces for any product
  // that was created before the publishablePublish fix landed, or for any
  // channel that was added between creation and activation.
  if (status === 'active') {
    try {
      await publishToAllChannels(productId)
    } catch (pubErr) {
      console.warn('[shopify] publishToAllChannels on activate failed (non-fatal):', String(pubErr))
    }
  }

  console.log(`[shopify] Product ${productId} status updated to ${status}`)
}

/* ------------------------------------------------------------------ */
/* Delivery profiles                                                   */
/*                                                                     */
/* Every Shopify store has one or more "delivery profiles" — named     */
/* groupings that determine which shipping rates apply to a product.   */
/* NCE has five (next-day pallet, small courier, contact-us, large     */
/* courier, free). Until now, every newly-created product landed in    */
/* the default profile and Rich had to open Shopify admin and move it  */
/* manually. These helpers list profiles and attach a variant to one.  */
/* Requires read_shipping + write_shipping scopes.                     */
/* ------------------------------------------------------------------ */

export interface DeliveryProfile {
  id: string // GraphQL GID, e.g. "gid://shopify/DeliveryProfile/12345"
  name: string
  default: boolean
}

export async function fetchDeliveryProfiles(): Promise<DeliveryProfile[]> {
  const query = `
    query {
      deliveryProfiles(first: 50) {
        edges { node { id name default } }
      }
    }
  `
  try {
    const data = await shopifyGraphQL<{
      deliveryProfiles: { edges: { node: DeliveryProfile }[] }
    }>(query)
    return data.deliveryProfiles.edges.map((e) => e.node)
  } catch (e) {
    console.error('[shopify] fetchDeliveryProfiles failed:', String(e))
    return []
  }
}

// Fetch the first variant ID for a product. Used during edits where we want
// to (re)assign the product to a delivery profile but only have the product ID.
export async function fetchFirstVariantId(productId: number): Promise<number | null> {
  const result = await shopifyFetch<{ product: { variants: { id: number }[] } }>(
    `/products/${productId}.json?fields=id,variants`
  )
  return result.product.variants?.[0]?.id ?? null
}

export async function assignVariantToDeliveryProfile(
  profileId: string,
  variantId: number
): Promise<void> {
  const variantGid = `gid://shopify/ProductVariant/${variantId}`
  const mutation = `
    mutation moveVariant($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id name }
        userErrors { field message }
      }
    }
  `
  const data = await shopifyGraphQL<{
    deliveryProfileUpdate: {
      profile: { id: string; name: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(mutation, {
    id: profileId,
    profile: { variantsToAssociate: [variantGid] },
  })
  const errs = data.deliveryProfileUpdate.userErrors
  if (errs && errs.length) {
    throw new Error(`deliveryProfileUpdate: ${errs.map((e) => e.message).join('; ')}`)
  }
  console.log(`[shopify] Variant ${variantId} attached to delivery profile ${profileId}`)
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
