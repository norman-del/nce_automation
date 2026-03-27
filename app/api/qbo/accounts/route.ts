import { NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'

// GET /api/qbo/accounts — fetch chart of accounts from QBO (read-only, nothing is changed)
export async function GET() {
  try {
    const { client, connection } = await getQboClient()

    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.findAccounts({}, (err: any, result: any) => {
        if (err) reject(err)
        else resolve(result)
      })
    })

    const accounts = ((data?.QueryResponse as Record<string, unknown>)?.Account as unknown[] ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({
        id: a.Id,
        name: a.Name,
        type: a.AccountType,
        subtype: a.AccountSubType,
        active: a.Active,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({
      realmId: connection.realm_id,
      count: accounts.length,
      accounts,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
