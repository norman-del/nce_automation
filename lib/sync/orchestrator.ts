import { fetchBalanceTransactions } from '../shopify/payouts'
import { fetchOrder, extractOrderDetails } from '../shopify/orders'
import { createJournalEntry } from '../qbo/journal'
import { findInvoiceForOrder } from '../qbo/invoices'
import { createPayment } from '../qbo/payments'
import { createServiceClient } from '../supabase/client'
import { getQboConnection } from '../qbo/client'

export interface PaymentResult {
  orderNumber: string
  customerName: string | null
  amount: number
  status: 'paid' | 'already_paid' | 'no_invoice' | 'error'
  error?: string
}

export interface SyncResult {
  success: boolean
  journalEntryId: string | null
  journalCreated: boolean
  totalFees: number
  payments: PaymentResult[]
  errors: string[]
}

export async function syncPayout(shopifyPayoutId: number): Promise<SyncResult> {
  const db = createServiceClient()
  const errors: string[] = []
  let journalEntryId: string | null = null
  let journalCreated = false
  let totalFees = 0
  const payments: PaymentResult[] = []

  // 1. Find our DB payout record
  const { data: payout } = await db
    .from('payouts')
    .select('*')
    .eq('shopify_payout_id', shopifyPayoutId)
    .single()

  if (!payout) throw new Error(`Payout ${shopifyPayoutId} not found in database`)

  const qboConnection = await getQboConnection()
  if (!qboConnection) throw new Error('QBO not connected')
  if (!qboConnection.shopify_fees_account_id || !qboConnection.bank_account_id) {
    throw new Error('QBO account mapping incomplete — set up in Settings')
  }

  // 2. Fetch balance transactions from Shopify
  const transactions = await fetchBalanceTransactions(shopifyPayoutId)
  const charges = transactions.filter(
    (t) => t.type === 'charge' && t.source_order_id
  )

  // 3. Store transactions in DB + fetch order details
  const txnRows = []
  for (const txn of charges) {
    const existing = await db
      .from('payout_transactions')
      .select('id')
      .eq('shopify_transaction_id', txn.id)
      .single()

    if (existing.data) continue // already stored

    let orderDetails = {
      orderNumber: String(txn.source_id),
      customerName: 'Unknown',
      companyName: 'Unknown',
    }

    if (txn.source_order_id) {
      try {
        const order = await fetchOrder(txn.source_order_id)
        orderDetails = extractOrderDetails(order)
      } catch (e) {
        errors.push(`Failed to fetch order ${txn.source_order_id}: ${e}`)
      }
    }

    txnRows.push({
      payout_id: payout.id,
      shopify_transaction_id: txn.id,
      shopify_order_id: txn.source_order_id,
      order_number: orderDetails.orderNumber,
      transaction_type: txn.type,
      customer_name: orderDetails.customerName,
      company_name: orderDetails.companyName,
      amount: parseFloat(txn.amount),
      fee: parseFloat(txn.fee),
      net: parseFloat(txn.net),
    })
  }

  if (txnRows.length > 0) {
    await db.from('payout_transactions').insert(txnRows)
  }

  // Fetch all transactions for this payout (including previously stored)
  const { data: allTxns } = await db
    .from('payout_transactions')
    .select('*')
    .eq('payout_id', payout.id)
    .eq('transaction_type', 'charge')

  // 4. Create QBO journal entry (idempotent)
  if (!payout.journal_entry_id && allTxns && allTxns.length > 0) {
    try {
      totalFees = allTxns.reduce((sum, t) => sum + Number(t.fee), 0)
      const lineItems = allTxns.map((t) => ({
        orderNumber: t.order_number ?? String(t.shopify_transaction_id),
        companyName: t.company_name ?? t.customer_name ?? 'Unknown',
        feeAmount: Number(t.fee),
        shopifyFeesAccountId: qboConnection.shopify_fees_account_id!,
      }))

      journalEntryId = await createJournalEntry({
        payoutDate: payout.payout_date,
        totalFees,
        bankAccountId: qboConnection.bank_account_id!,
        lineItems,
      })
      journalCreated = true

      await db
        .from('payouts')
        .update({
          journal_entry_id: journalEntryId,
          journal_synced_at: new Date().toISOString(),
        })
        .eq('id', payout.id)

      await db.from('sync_log').insert({
        action: 'journal_create',
        payout_id: payout.id,
        status: 'success',
        details: { journal_entry_id: journalEntryId, total_fees: totalFees },
      })
    } catch (e) {
      const msg = `Journal entry failed: ${e}`
      errors.push(msg)
      await db.from('sync_log').insert({
        action: 'journal_create',
        payout_id: payout.id,
        status: 'error',
        details: { error: msg },
      })
    }
  } else {
    journalEntryId = payout.journal_entry_id
    if (allTxns) totalFees = allTxns.reduce((sum, t) => sum + Number(t.fee), 0)
  }

  // 5. Match invoices + create payments (per transaction, isolated)
  if (allTxns) {
    for (const txn of allTxns) {
      if (txn.qbo_payment_id) {
        payments.push({
          orderNumber: txn.order_number ?? String(txn.shopify_transaction_id),
          customerName: txn.company_name ?? txn.customer_name,
          amount: Number(txn.amount),
          status: 'already_paid',
        })
        continue
      }

      try {
        const invoice = await findInvoiceForOrder({
          orderNumber: txn.order_number ?? '',
          grossAmount: Number(txn.amount),
          payoutDate: payout.payout_date,
        })
        if (!invoice) {
          await db
            .from('payout_transactions')
            .update({ payment_status: 'no_invoice' })
            .eq('id', txn.id)
          payments.push({
            orderNumber: txn.order_number ?? String(txn.shopify_transaction_id),
            customerName: txn.company_name ?? txn.customer_name,
            amount: Number(txn.amount),
            status: 'no_invoice',
          })
          continue
        }

        await db
          .from('payout_transactions')
          .update({ qbo_invoice_id: invoice.Id, payment_status: 'invoice_found' })
          .eq('id', txn.id)

        const paymentId = await createPayment({
          customerRef: invoice.CustomerRef.value,
          totalAmt: Number(txn.amount), // gross amount — clears the full invoice; journal entry handles the fee separately
          invoiceId: invoice.Id,
          paymentDate: payout.payout_date,
          orderNumber: txn.order_number ?? '',
          depositToAccountId: qboConnection.bank_account_id!,
        })

        await db
          .from('payout_transactions')
          .update({
            qbo_payment_id: paymentId,
            payment_synced_at: new Date().toISOString(),
            payment_status: 'payment_created',
          })
          .eq('id', txn.id)

        await db.from('sync_log').insert({
          action: 'payment_create',
          payout_id: payout.id,
          status: 'success',
          details: { order_number: txn.order_number, payment_id: paymentId },
        })

        payments.push({
          orderNumber: txn.order_number ?? String(txn.shopify_transaction_id),
          customerName: txn.company_name ?? txn.customer_name,
          amount: Number(txn.amount),
          status: 'paid',
        })
      } catch (e) {
        const msg = `Payment for ${txn.order_number} failed: ${e}`
        errors.push(msg)
        await db
          .from('payout_transactions')
          .update({ payment_status: 'error', payment_error: msg })
          .eq('id', txn.id)
        await db.from('sync_log').insert({
          action: 'payment_create',
          payout_id: payout.id,
          status: 'error',
          details: { order_number: txn.order_number, error: msg },
        })
        payments.push({
          orderNumber: txn.order_number ?? String(txn.shopify_transaction_id),
          customerName: txn.company_name ?? txn.customer_name,
          amount: Number(txn.amount),
          status: 'error',
          error: msg,
        })
      }
    }
  }

  // 6. Update overall payout sync status
  const finalStatus = errors.length === 0 ? 'synced' : 'error'
  await db
    .from('payouts')
    .update({
      sync_status: finalStatus,
      sync_error: errors.length > 0 ? errors.join('; ') : null,
    })
    .eq('id', payout.id)

  return {
    success: errors.length === 0,
    journalEntryId,
    journalCreated,
    totalFees,
    payments,
    errors,
  }
}
