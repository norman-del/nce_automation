import { shopifyFetch } from './client'

export interface ShopifyPayout {
  id: number
  status: 'scheduled' | 'in_transit' | 'paid' | 'failed' | 'cancelled'
  date: string // YYYY-MM-DD
  currency: string
  amount: string
  summary: {
    adjustments_fee_amount: string
    adjustments_gross_amount: string
    charges_fee_amount: string
    charges_gross_amount: string
    refunds_fee_amount: string
    refunds_gross_amount: string
    reserved_funds_fee_amount: string
    reserved_funds_gross_amount: string
    retried_payouts_fee_amount: string
    retried_payouts_gross_amount: string
  }
}

export interface ShopifyBalanceTransaction {
  id: number
  type: 'charge' | 'refund' | 'dispute' | 'reserve' | 'adjustment' | 'payout'
  test: boolean
  payout_id: number
  currency: string
  amount: string
  fee: string
  net: string
  source_id: number
  source_type: 'Order' | 'Refund' | 'Dispute' | 'Transfer'
  source_order_id: number | null
  processed_at: string
}

interface PayoutsResponse {
  payouts: ShopifyPayout[]
}

interface TransactionsResponse {
  transactions: ShopifyBalanceTransaction[]
}

export async function fetchPayouts(params?: {
  date_min?: string
  date_max?: string
  status?: string
  limit?: number
}): Promise<ShopifyPayout[]> {
  const query = new URLSearchParams()
  if (params?.date_min) query.set('date_min', params.date_min)
  if (params?.date_max) query.set('date_max', params.date_max)
  if (params?.status) query.set('status', params.status)
  query.set('limit', String(params?.limit ?? 50))

  const data = await shopifyFetch<PayoutsResponse>(
    `/shopify_payments/payouts.json?${query}`
  )
  return data.payouts
}

export async function fetchBalanceTransactions(
  payoutId: number,
  limit = 250
): Promise<ShopifyBalanceTransaction[]> {
  const query = new URLSearchParams({
    payout_id: String(payoutId),
    limit: String(limit),
  })
  const data = await shopifyFetch<TransactionsResponse>(
    `/shopify_payments/balance/transactions.json?${query}`
  )
  return data.transactions
}
