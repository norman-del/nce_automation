import { NextRequest, NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'

interface QboVendor {
  Id: string
  DisplayName: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QboAny = any

// GET /api/qbo/vendors?q=searchterm — search QBO vendors for typeahead
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()

  try {
    const { client: _client } = await getQboClient()
    const client = _client as QboAny

    const criteria = q
      ? { DisplayName: `%${q}%` }
      : {}

    const vendors = await new Promise<QboVendor[]>((resolve, reject) => {
      client.findVendors(
        criteria,
        (err: unknown, result: { QueryResponse: { Vendor?: QboVendor[] } }) => {
          if (err) reject(err)
          else resolve(result.QueryResponse.Vendor || [])
        }
      )
    })

    // Return simplified list for typeahead
    const list = vendors.map((v) => ({
      id: v.Id,
      name: v.DisplayName,
    }))

    return NextResponse.json(list)
  } catch (e) {
    console.error('[qbo/vendors] search failed:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
