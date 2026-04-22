import { NextResponse } from 'next/server'
import { getQboClient } from '@/lib/qbo/client'

// GET /api/qbo/debug/tax-codes — dump every tax code in the connected QBO instance.
// Read-only, used to diagnose Bug 1 (margin / 20% codes not applied to new products).
// See docs/plans/now-vs-strategic.md §5.
export async function GET() {
  try {
    const { client, connection } = await getQboClient()

    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(client as any).findTaxCodes({}, (err: unknown, result: Record<string, unknown>) => {
        if (err) reject(err)
        else resolve(result)
      })
    })

    const taxCodes = ((data?.QueryResponse as Record<string, unknown>)?.TaxCode as unknown[] ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((tc: any) => ({
        id: tc.Id,
        name: tc.Name,
        description: tc.Description ?? null,
        active: tc.Active,
        taxable: tc.Taxable,
        taxGroup: tc.TaxGroup ?? false,
        hidden: tc.Hidden ?? false,
        // Each tax code references one or more TaxRates via SalesTaxRateList / PurchaseTaxRateList.
        // Include these so we can see which underlying rate (e.g. "20% S", "VAT margin") is attached
        // to the sale vs purchase side of each code.
        salesTaxRateList: tc.SalesTaxRateList?.TaxRateDetail ?? [],
        purchaseTaxRateList: tc.PurchaseTaxRateList?.TaxRateDetail ?? [],
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))

    // Show what the current findTaxCodes() heuristic in lib/qbo/items.ts would pick.
    // This replicates the logic exactly so we can see if the match is wrong or the codes are fine
    // and the bug is elsewhere (e.g. PurchaseTaxIncluded + margin code being rejected by QBO).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let heuristicStandard: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let heuristicMargin: any = null
    for (const tc of taxCodes) {
      const n = String(tc.name).toLowerCase()
      if (n.includes('20') && !heuristicStandard) heuristicStandard = { id: tc.id, name: tc.name }
      if (n.includes('margin') && !heuristicMargin) heuristicMargin = { id: tc.id, name: tc.name }
    }

    return NextResponse.json({
      realmId: connection.realm_id,
      count: taxCodes.length,
      heuristic: {
        // What the current code in lib/qbo/items.ts would select. Null means throw at items.ts:292.
        standardRated: heuristicStandard,
        margin: heuristicMargin,
      },
      taxCodes,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
