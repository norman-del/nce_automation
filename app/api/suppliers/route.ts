import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'

// GET /api/suppliers?q=searchterm  — list / typeahead search
export async function GET(req: NextRequest) {
  try {
    const db = createServiceClient()
    const q = req.nextUrl.searchParams.get('q')?.trim()

    let query = db
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    if (q) {
      query = query.ilike('name', `%${q}%`)
    }

    const { data, error } = await query.limit(50)
    if (error) throw error

    return NextResponse.json(data)
  } catch (e) {
    console.error('Suppliers GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/suppliers — create a new supplier
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, contact_name, phone, email, address_line1, address_line2, city, county, postcode } = body as {
      name: string
      contact_name?: string
      phone?: string
      email?: string
      address_line1?: string
      address_line2?: string
      city?: string
      county?: string
      postcode?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data, error } = await db
      .from('suppliers')
      .insert({
        name: name.trim(),
        contact_name: contact_name?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address_line1: address_line1?.trim() || null,
        address_line2: address_line2?.trim() || null,
        city: city?.trim() || null,
        county: county?.trim() || null,
        postcode: postcode?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('Suppliers POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
