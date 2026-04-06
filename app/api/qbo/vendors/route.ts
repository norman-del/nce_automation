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
  console.log('[qbo/vendors] search query:', q || '(all)')

  try {
    const { client: _client } = await getQboClient()
    const client = _client as QboAny

    // node-quickbooks findVendors uses criteria arrays for LIKE queries
    // Format: [{ field: 'DisplayName', value: '%term%', operator: 'LIKE' }]
    const criteria = q
      ? [{ field: 'DisplayName', value: `%${q}%`, operator: 'LIKE' }]
      : []

    const vendors = await new Promise<QboVendor[]>((resolve, reject) => {
      client.findVendors(
        criteria,
        (err: unknown, result: { QueryResponse: { Vendor?: QboVendor[] } }) => {
          if (err) {
            const axErr = err as { response?: { data?: unknown }; message?: string }
            const detail = axErr.response?.data ? JSON.stringify(axErr.response.data) : String(err)
            console.error('[qbo/vendors] findVendors failed:', detail)
            reject(new Error(detail))
          } else {
            resolve(result.QueryResponse.Vendor || [])
          }
        }
      )
    })

    console.log('[qbo/vendors] found', vendors.length, 'vendors')
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
