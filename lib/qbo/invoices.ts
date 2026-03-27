import { getQboClient } from './client'

export interface QboInvoice {
  Id: string
  DocNumber: string
  CustomerRef: { value: string; name: string }
  TotalAmt: number
  Balance: number
  TxnDate?: string
  PONumber?: string
  CustomerMemo?: { value: string }
  PrivateNote?: string
}

type FindInvoicesResponse = { QueryResponse: { Invoice?: QboInvoice[] } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function searchInvoices(client: any, criteria: { field: string; value: string; operator?: string }[]): Promise<QboInvoice[]> {
  return new Promise((resolve, reject) => {
    client.findInvoices(criteria, (err: unknown, data: FindInvoicesResponse) => {
      if (err) return reject(err)
      resolve(data?.QueryResponse?.Invoice ?? [])
    })
  })
}

/**
 * Find a QBO invoice that corresponds to a Shopify order.
 *
 * Tries three strategies in order:
 * 1. PONumber field — Shopify-QBO connector stores the order ref here
 * 2. Date range (±3 days) + gross amount match — catches cases where PONumber isn't set
 * 3. Customer name contains order number — last resort text search
 *
 * Returns the matched invoice and which strategy found it (logged to console for visibility).
 */
export async function findInvoiceForOrder({
  orderNumber,
  grossAmount,
  payoutDate,
}: {
  orderNumber: string
  grossAmount: number
  payoutDate: string // YYYY-MM-DD
}): Promise<QboInvoice | null> {
  const { client } = await getQboClient()

  // Strategy 1: PONumber match (standard Shopify-QBO connector behaviour)
  try {
    const results = await searchInvoices(client, [
      { field: 'PONumber', value: orderNumber },
    ])
    if (results.length > 0) {
      console.log(`[invoice-match] Strategy 1 (PONumber) matched ${orderNumber} → QBO invoice ${results[0].Id}`)
      return results[0]
    }
  } catch (e) {
    console.warn(`[invoice-match] Strategy 1 (PONumber) failed: ${e}`)
  }

  // Strategy 2: Date range ± 3 days, filter client-side by gross amount
  try {
    const d = new Date(payoutDate)
    const from = new Date(d)
    from.setDate(from.getDate() - 3)
    const to = new Date(d)
    to.setDate(to.getDate() + 3)

    const results = await searchInvoices(client, [
      { field: 'TxnDate', value: from.toISOString().split('T')[0], operator: '>=' },
      { field: 'TxnDate', value: to.toISOString().split('T')[0], operator: '<=' },
    ])

    // Match by gross amount within 1p tolerance (floating point safety)
    const amountMatch = results.find(
      (inv) => Math.abs(Number(inv.TotalAmt) - grossAmount) < 0.02
    )
    if (amountMatch) {
      console.log(`[invoice-match] Strategy 2 (date+amount) matched ${orderNumber} → QBO invoice ${amountMatch.Id} (£${amountMatch.TotalAmt})`)
      return amountMatch
    }
  } catch (e) {
    console.warn(`[invoice-match] Strategy 2 (date+amount) failed: ${e}`)
  }

  // Strategy 3: Search by order number in CustomerMemo or PrivateNote (text search)
  try {
    const results = await searchInvoices(client, [
      { field: 'CustomerMemo', value: `%${orderNumber}%`, operator: 'LIKE' },
    ])
    if (results.length > 0) {
      console.log(`[invoice-match] Strategy 3 (CustomerMemo) matched ${orderNumber} → QBO invoice ${results[0].Id}`)
      return results[0]
    }
  } catch (e) {
    console.warn(`[invoice-match] Strategy 3 (CustomerMemo) failed or unsupported: ${e}`)
  }

  console.warn(`[invoice-match] No match found for order ${orderNumber} (£${grossAmount} on ${payoutDate})`)
  return null
}

/** @deprecated use findInvoiceForOrder instead */
export async function findInvoiceByDocNumber(
  docNumber: string
): Promise<QboInvoice | null> {
  const { client } = await getQboClient()
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client as any).findInvoices(
      [{ field: 'DocNumber', value: docNumber }],
      (err: unknown, invoices: FindInvoicesResponse) => {
        if (err) return reject(err)
        const found = invoices?.QueryResponse?.Invoice
        resolve(found && found.length > 0 ? found[0] : null)
      }
    )
  })
}
