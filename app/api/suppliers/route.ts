import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { findOrCreateQboVendor } from '@/lib/qbo/items'

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
//
// Saves to Supabase first (source of truth), then pushes to QBO as a Vendor.
// Same isolation pattern as createQboItem: if QBO fails the Supabase row still
// saves and the QBO error is captured on suppliers.sync_error for retry.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      first_name,
      last_name,
      company_name,
      display_name,
      phone,
      address_line1,
      city,
      postcode,
    } = body as {
      first_name?: string
      last_name?: string
      company_name?: string
      display_name?: string
      phone?: string
      address_line1?: string
      city?: string
      postcode?: string
    }

    const company = company_name?.trim() || ''
    const first = first_name?.trim() || ''
    const last = last_name?.trim() || ''
    const contact = [first, last].filter(Boolean).join(' ') || null

    // Display name defaults: company if available, else "First Last"
    const name = (display_name?.trim() || company || contact || '').trim()
    if (!name) {
      return NextResponse.json(
        { error: 'Supplier display name is required (provide company or first/last name)' },
        { status: 400 }
      )
    }

    const db = createServiceClient()
    const { data, error } = await db
      .from('suppliers')
      .insert({
        name,
        company_name: company || null,
        contact_name: contact,
        phone: phone?.trim() || null,
        address_line1: address_line1?.trim() || null,
        city: city?.trim() || null,
        postcode: postcode?.trim() || null,
      })
      .select()
      .single()

    if (error) throw error

    // Push to QBO as Vendor — non-blocking. Same pattern as createQboItem.
    try {
      const qboVendorId = await findOrCreateQboVendor({
        name: data.name,
        company_name: data.company_name,
        contact_name: data.contact_name,
        phone: data.phone,
        email: null,
        address_line1: data.address_line1,
        address_line2: null,
        city: data.city,
        county: null,
        postcode: data.postcode,
      })
      const { data: updated } = await db
        .from('suppliers')
        .update({ qbo_vendor_id: qboVendorId, sync_error: null })
        .eq('id', data.id)
        .select()
        .single()
      console.log(`[suppliers/POST] ${name} → QBO ok, vendorId=${qboVendorId}`)
      return NextResponse.json(updated ?? { ...data, qbo_vendor_id: qboVendorId }, { status: 201 })
    } catch (qboErr) {
      const msg = qboErr instanceof Error ? qboErr.message : String(qboErr)
      console.error(`[suppliers/POST] ${name} → QBO FAILED:`, msg)
      await db
        .from('suppliers')
        .update({ sync_error: `QBO: ${msg}` })
        .eq('id', data.id)
      // Return the supplier anyway — the form can still proceed without a QBO link.
      return NextResponse.json(
        { ...data, sync_error: `QBO: ${msg}` },
        { status: 201 }
      )
    }
  } catch (e) {
    console.error('Suppliers POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
