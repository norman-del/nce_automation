import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { getStaffUserFromRequest } from '@/lib/auth/staff'

// POST /api/collections/[id]/image — upload collection cover image
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
    const formData = await req.formData()
    const file = formData.get('image') as File | null

    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const db = createServiceClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const storagePath = `${id}/${Date.now()}.${ext}`
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

    const { data, error } = await db
      .from('collections')
      .update({ image_url: urlData.publicUrl })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
