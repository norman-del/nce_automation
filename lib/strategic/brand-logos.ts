// Vendor logo resolver — looks up a brand from the vendor_logos table by
// alias and returns the matched row (or null). Used by:
//   - lib/strategic/products/{create,update}.ts to auto-set products.vendor_logo_url
//   - app/api/vendor-logos/match/route.ts for the form-side preview

import type { SupabaseClient } from '@supabase/supabase-js'

export interface VendorLogoMatch {
  handle: string
  name: string
  aliases: string[]
  logo_url: string | null
}

export async function resolveVendorLogo(
  db: SupabaseClient,
  vendor: string | null | undefined
): Promise<VendorLogoMatch | null> {
  if (!vendor) return null
  const key = vendor.toLowerCase().trim()
  if (!key) return null

  // GIN array containment — exact alias match. Aliases are stored lowercased
  // in the seed and on every admin write.
  const { data, error } = await db
    .from('vendor_logos')
    .select('handle, name, aliases, logo_url')
    .contains('aliases', [key])
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as VendorLogoMatch
}
