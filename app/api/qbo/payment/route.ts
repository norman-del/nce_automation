import { NextRequest, NextResponse } from 'next/server'
import { findInvoiceByDocNumber } from '@/lib/qbo/invoices'
import { createPayment } from '@/lib/qbo/payments'
import { createServiceClient } from '@/lib/supabase/client'
import { getQboConnection } from '@/lib/qbo/client'

export async function POST(req: NextRequest) {
  try {
    const { transactionId } = await req.json() as { transactionId: string }
    console.log('[payment] Request for transaction:', transactionId)
    const db = createServiceClient()

    const { data: txn } = await db
      .from('payout_transactions')
      .select('*, payouts(payout_date)')
      .eq('id', transactionId)
      .single()

    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (txn.qbo_payment_id) {
      console.log('[payment] Already exists:', txn.qbo_payment_id)
      return NextResponse.json({ paymentId: txn.qbo_payment_id, alreadyExists: true })
    }

    const invoice = await findInvoiceByDocNumber(txn.order_number)
    if (!invoice) {
      await db
        .from('payout_transactions')
        .update({ payment_status: 'no_invoice' })
        .eq('id', transactionId)
      return NextResponse.json({ error: 'No matching QBO invoice found' }, { status: 404 })
    }

    await db
      .from('payout_transactions')
      .update({ qbo_invoice_id: invoice.Id, payment_status: 'invoice_found' })
      .eq('id', transactionId)

    const connection = await getQboConnection()
    if (!connection?.bank_account_id) {
      return NextResponse.json({ error: 'Bank account not mapped in Settings' }, { status: 400 })
    }
    const payoutDate = (txn.payouts as { payout_date: string }).payout_date
    const paymentId = await createPayment({
      customerRef: invoice.CustomerRef.value,
      totalAmt: Number(txn.amount),
      invoiceId: invoice.Id,
      paymentDate: payoutDate,
      orderNumber: txn.order_number ?? '',
      depositToAccountId: connection.bank_account_id,
    })

    console.log('[payment] Created:', paymentId, 'for order:', txn.order_number)
    await db
      .from('payout_transactions')
      .update({
        qbo_payment_id: paymentId,
        payment_synced_at: new Date().toISOString(),
        payment_status: 'payment_created',
      })
      .eq('id', transactionId)

    return NextResponse.json({ paymentId })
  } catch (e) {
    console.error('Payment creation error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
