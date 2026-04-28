import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'
import { fireCollectionReindex, logCollectionAction } from '@/lib/collections/triggers'

// POST /api/collections/[id]/image?slot=cover|featured
// slot=cover (default) writes image_url; slot=featured writes featured_image_url.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await getStaffUserFromRequest(req)
    if (!staff || staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const { id } = await params
    const slot = req.nextUrl.searchParams.get('slot') === 'featured' ? 'featured' : 'cover'
    const formData = await req.formData()
    const file = formData.get('image') as File | null

    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const db = createServiceClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const storagePath = `${id}/${slot}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await db.storage
      .from('collection-images')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

    const { data: urlData } = db.storage
      .from('collection-images')
      .getPublicUrl(storagePath)

    const column = slot === 'featured' ? 'featured_image_url' : 'image_url'
    const { data, error } = await db
      .from('collections')
      .update({ [column]: urlData.publicUrl })
      .eq('id', id)
      .select('id, handle, image_url, featured_image_url')
      .single()

    if (error) throw error

    await logCollectionAction('image_upload', 'success', { id, handle: data.handle, slot })
    fireCollectionReindex(data.handle)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
