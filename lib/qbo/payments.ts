import { getQboClient } from './client'

export interface CreatePaymentParams {
  customerRef: string // QBO customer ID
  totalAmt: number    // Net amount (amount - fee)
  invoiceId: string   // QBO invoice ID
  paymentDate: string // YYYY-MM-DD
  orderNumber: string // for memo/private note
}

export async function createPayment(params: CreatePaymentParams): Promise<string> {
  const { client } = await getQboClient()

  return new Promise((resolve, reject) => {
    client.createPayment(
      {
        TxnDate: params.paymentDate,
        CustomerRef: { value: params.customerRef },
        TotalAmt: params.totalAmt,
        PrivateNote: `Shopify order ${params.orderNumber} — created by QBO Fee Sync`,
        Line: [
          {
            Amount: params.totalAmt,
            LinkedTxn: [
              {
                TxnId: params.invoiceId,
                TxnType: 'Invoice', // must be exactly "Invoice"
              },
            ],
          },
        ],
      },
      (err: unknown, payment: { Id: string }) => {
        if (err) reject(err)
        else resolve(payment.Id)
      }
    )
  })
}
