// Admin-only:
//   POST   /api/vendor-logos/[handle]            multipart upload of a new logo file
//   DELETE /api/vendor-logos/[handle]            clears the file (row + aliases stay)
//   PATCH  /api/vendor-logos/[handle]            update name + aliases
// Files live in the 'vendor-logos' Supabase Storage bucket (created in
// migration 20260506130000_vendor_logos).

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest, isAdmin } from '@/lib/auth/staff'

const BUCKET = 'vendor-logos'
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'])

function extFromContentType(ct: string): string {
  if (ct === 'image/svg+xml') return 'svg'
  if (ct === 'image/png') return 'png'
  if (ct === 'image/webp') return 'webp'
  return 'jpg'
}

export async function POST(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff || !isAdmin(staff.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { handle } = await ctx.params
  const db = createServiceClient()

  const { data: brand, error: fetchErr } = await db
    .from('vendor_logos')
    .select('handle, storage_path')
    .eq('handle', handle)
    .single()
  if (fetchErr || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 413 })
  }
  const contentType = file.type || 'application/octet-stream'
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: `Unsupported type: ${contentType}` }, { status: 415 })
  }

  const ext = extFromContentType(contentType)
  // Cache-bust the path with a timestamp so CDN never serves a stale logo.
  const storagePath = `${handle}/${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false })
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  }

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const logoUrl = urlData.publicUrl

  // Update row, then best-effort delete the previous file.
  const { error: updateErr } = await db
    .from('vendor_logos')
    .update({ logo_url: logoUrl, storage_path: storagePath, content_type: contentType, updated_at: new Date().toISOString() })
    .eq('handle', handle)
  if (updateErr) {
    await db.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: `Save failed: ${updateErr.message}` }, { status: 500 })
  }

  if (brand.storage_path && brand.storage_path !== storagePath) {
    await db.storage.from(BUCKET).remove([brand.storage_path]).catch(() => {})
  }

  // Backfill: any product whose vendor matches this brand's aliases gets the
  // new URL. Keeps the storefront in sync without a separate cron.
  await backfillProductsForBrand(db, handle, logoUrl).catch((err) =>
    console.warn('[vendor-logos POST] backfill failed:', String(err))
  )

  return NextResponse.json({ ok: true, logo_url: logoUrl })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff || !isAdmin(staff.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const { handle } = await ctx.params
  const db = createServiceClient()

  const { data: brand } = await db
    .from('vendor_logos')
    .select('storage_path')
    .eq('handle', handle)
    .single()
  if (brand?.storage_path) {
    await db.storage.from(BUCKET).remove([brand.storage_path]).catch(() => {})
  }

  await db
    .from('vendor_logos')
    .update({ logo_url: null, storage_path: null, content_type: null, updated_at: new Date().toISOString() })
    .eq('handle', handle)

  await backfillProductsForBrand(db, handle, null).catch((err) =>
    console.warn('[vendor-logos DELETE] backfill failed:', String(err))
  )

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const staff = await getStaffUserFromRequest(req)
  if (!staff || !isAdmin(staff.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const { handle } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (Array.isArray(body.aliases)) {
    updates.aliases = body.aliases
      .map((a: unknown) => String(a).toLowerCase().trim())
      .filter(Boolean)
  }
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  const db = createServiceClient()
  const { error } = await db.from('vendor_logos').update(updates).eq('handle', handle)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Update products.vendor_logo_url for every product whose vendor matches
// any alias of this brand. Uses the same alias array stored on the row.
async function backfillProductsForBrand(
  db: ReturnType<typeof createServiceClient>,
  handle: string,
  logoUrl: string | null
) {
  const { data: brand } = await db
    .from('vendor_logos')
    .select('aliases')
    .eq('handle', handle)
    .single()
  if (!brand?.aliases?.length) return

  // products.vendor is free-text; match case-insensitively against aliases.
  // Pull the affected products in one query then update.
  const { data: candidates } = await db
    .from('products')
    .select('id, vendor')
  if (!candidates) return

  const aliasSet = new Set<string>(brand.aliases.map((a: string) => a.toLowerCase().trim()))
  const ids = candidates
    .filter((p) => p.vendor && aliasSet.has(p.vendor.toLowerCase().trim()))
    .map((p) => p.id)
  if (ids.length === 0) return

  await db.from('products').update({ vendor_logo_url: logoUrl }).in('id', ids)
}
