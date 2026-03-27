import { NextRequest, NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'

// GET /api/qbo/invoice/[id] — inspect a single QBO invoice (read-only diagnostic)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { client } = await getQboClient()
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.getInvoice(id, (err: any, invoice: any) => {
        if (err) {
          resolve(NextResponse.json({ error: err.message ?? JSON.stringify(err) }, { status: 500 }))
          return
        }
        resolve(NextResponse.json(invoice))
      })
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
