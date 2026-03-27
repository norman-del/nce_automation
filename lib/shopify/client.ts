// Shopify REST client using Custom App access token
// No OAuth needed — single store, token is stable

const SHOPIFY_API_VERSION = '2024-10'

export function getShopifyBaseUrl(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN is not set')
  return `https://${domain}/admin/api/${SHOPIFY_API_VERSION}`
}

export async function shopifyFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not set')

  const url = `${getShopifyBaseUrl()}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}
