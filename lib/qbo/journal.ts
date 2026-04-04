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
  const { client, connection } = await getQboClient()
  console.log('[qbo-journal] Token expires at:', connection.token_expires_at)

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

  const journalData = {
    TxnDate: params.payoutDate,
    PrivateNote: `Shopify fees payout ${params.payoutDate} — created by QBO Fee Sync`,
    Line: journalLines,
  }

  console.log('[qbo-journal] Creating journal entry for', params.payoutDate, 'with', journalLines.length, 'lines')
  console.log('[qbo-journal] Realm ID:', connection.realm_id, 'Sandbox:', process.env.QBO_ENVIRONMENT !== 'production')

  return new Promise((resolve, reject) => {
    client.createJournalEntry(
      journalData,
      (err: unknown, entry: { Id: string }) => {
        if (err) {
          console.error('[qbo-journal] Error creating journal entry:', JSON.stringify(err, null, 2))
          reject(err)
        } else {
          console.log('[qbo-journal] Created journal entry:', entry.Id)
          resolve(entry.Id)
        }
      }
    )
  })
}
