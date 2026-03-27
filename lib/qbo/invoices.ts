import { getQboClient } from './client'

export interface QboInvoice {
  Id: string
  DocNumber: string
  CustomerRef: { value: string; name: string }
  TotalAmt: number
  Balance: number
}

export async function findInvoiceByDocNumber(
  docNumber: string
): Promise<QboInvoice | null> {
  const { client } = await getQboClient()

  return new Promise((resolve, reject) => {
    client.findInvoices(
      [{ field: 'DocNumber', value: docNumber }],
      (err: unknown, invoices: { QueryResponse: { Invoice?: QboInvoice[] } }) => {
        if (err) return reject(err)
        const found = invoices?.QueryResponse?.Invoice
        resolve(found && found.length > 0 ? found[0] : null)
      }
    )
  })
}
