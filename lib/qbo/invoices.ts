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
 * Identity-anchored match only: resolves the customer in QBO by company/personal
 * name, then looks for an unpaid invoice belonging to that customer with the
 * matching gross amount. If the customer has exactly one unpaid invoice, that
 * one wins even without an amount match.
 *
 * If the customer can't be resolved, the function returns null and the
 * transaction is surfaced as `no_invoice` for manual handling. We deliberately
 * do NOT fall back to date+amount matching — that previously caused a £620
 * Shopify payment (NCE1610, Pear Tree) to be posted against an unrelated
 * in-store invoice of the same amount belonging to a different customer.
 */
export async function findInvoiceForOrder({
  orderNumber,
  grossAmount,
  payoutDate,
  companyName,
  customerName,
}: {
  orderNumber: string
  grossAmount: number
  payoutDate: string // YYYY-MM-DD
  companyName?: string | null
  customerName?: string | null
}): Promise<QboInvoice | null> {
  const namesToTry = [companyName, customerName].filter(Boolean) as string[]
  for (const nameToSearch of namesToTry) {
    try {
      const { client } = await getQboClient()

      type CustomerResponse = { QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string }> } }
      const customers = await new Promise<Array<{ Id: string; DisplayName: string }>>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(client as any).findCustomers(
          [{ field: 'DisplayName', value: nameToSearch, operator: 'LIKE' }],
          (err: unknown, data: CustomerResponse) => {
            if (err) return reject(err)
            resolve(data?.QueryResponse?.Customer ?? [])
          }
        )
      })

      if (customers.length > 0) {
        const customerId = customers[0].Id
        const invoices = await searchInvoices(client, [
          { field: 'CustomerRef', value: customerId },
        ])
        const unpaid = invoices.filter((inv) => Number(inv.Balance) > 0)
        const amountMatch = unpaid.find(
          (inv) => Math.abs(Number(inv.TotalAmt) - grossAmount) < 0.02
        )
        const match = amountMatch ?? (unpaid.length === 1 ? unpaid[0] : null)
        if (match) {
          console.log(`[invoice-match] matched ${orderNumber} → QBO invoice ${match.Id} via customer "${nameToSearch}"`)
          return match
        }
      }
    } catch (e) {
      console.warn(`[invoice-match] customer-name lookup failed for "${nameToSearch}": ${e}`)
    }
  }

  console.warn(`[invoice-match] No match found for order ${orderNumber} (£${grossAmount} on ${payoutDate}) — customer not resolved or no matching unpaid invoice`)
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
