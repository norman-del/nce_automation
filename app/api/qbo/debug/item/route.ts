import { NextRequest, NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'

// GET /api/qbo/debug/item?id=<qbo_item_id>
// Read-only — dumps the full raw QBO item record so we can inspect what
// PurchaseTaxCodeRef / SalesTaxCodeRef actually look like as stored.
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing ?id=' }, { status: 400 })

    const { client: _client } = await getQboClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = _client as any

    const item = await new Promise<unknown>((resolve, reject) => {
      client.getItem(id, (err: unknown, result: unknown) => {
        if (err) reject(err)
        else resolve(result)
      })
    })

    return NextResponse.json(item)
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
