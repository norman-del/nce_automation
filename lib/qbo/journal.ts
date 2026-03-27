import { getQboClient } from './client'

export interface JournalLineItem {
  orderNumber: string
  companyName: string
  feeAmount: number
  shopifyFeesAccountId: string
}

export interface CreateJournalEntryParams {
  payoutDate: string // YYYY-MM-DD
  totalFees: number
  bankAccountId: string
  lineItems: JournalLineItem[]
}

export async function createJournalEntry(
  params: CreateJournalEntryParams
): Promise<string> {
  const { client } = await getQboClient()

  const DETAIL_TYPE = 'JournalEntryLineDetail' as const

  const journalLines = params.lineItems.flatMap((item, i) => [
    // Debit: Shopify Fees expense (per order)
    {
      Id: String(i * 2 + 1),
      Amount: item.feeAmount,
      DetailType: DETAIL_TYPE,
      Description: `${item.orderNumber} - ${item.companyName}`,
      JournalEntryLineDetail: {
        PostingType: 'Debit',
        AccountRef: { value: item.shopifyFeesAccountId },
      },
    },
  ])

  // Single credit: Bank account for total fees
  journalLines.push({
    Id: String(params.lineItems.length * 2 + 1),
    Amount: params.totalFees,
    DetailType: DETAIL_TYPE,
    Description: `Shopify fees for payout ${params.payoutDate}`,
    JournalEntryLineDetail: {
      PostingType: 'Credit',
      AccountRef: { value: params.bankAccountId },
    },
  })

  return new Promise((resolve, reject) => {
    client.createJournalEntry(
      {
        TxnDate: params.payoutDate,
        PrivateNote: `Shopify fees payout ${params.payoutDate} — created by QBO Fee Sync`,
        Line: journalLines,
      },
      (err: unknown, entry: { Id: string }) => {
        if (err) reject(err)
        else resolve(entry.Id)
      }
    )
  })
}
