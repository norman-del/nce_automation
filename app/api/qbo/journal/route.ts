import { NextRequest, NextResponse } from 'next/server'
import { createJournalEntry } from '@/lib/qbo/journal'
import { createServiceClient } from '@/lib/supabase/client'
import { getQboConnection } from '@/lib/qbo/client'

export async function POST(req: NextRequest) {
  try {
    const { payoutId } = await req.json() as { payoutId: string }
    console.log('[journal] Request for payout:', payoutId)
    const db = createServiceClient()

    const { data: payout } = await db
      .from('payouts')
      .select('*, payout_transactions(*)')
      .eq('id', payoutId)
      .single()

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    if (payout.journal_entry_id) {
      console.log('[journal] Already exists:', payout.journal_entry_id)
      return NextResponse.json({
        journalEntryId: payout.journal_entry_id,
        alreadyExists: true,
      })
    }

    const qboConnection = await getQboConnection()
    if (!qboConnection?.shopify_fees_account_id || !qboConnection?.bank_account_id) {
      return NextResponse.json(
        { error: 'QBO account mapping not configured' },
        { status: 400 }
      )
    }

    const charges = (payout.payout_transactions as Array<{
      order_number: string | null
      company_name: string | null
      customer_name: string | null
      fee: number
      shopify_transaction_id: number
    }>).filter((t) => t.fee > 0)

    const totalFees = charges.reduce((sum, t) => sum + Number(t.fee), 0)
    const lineItems = charges.map((t) => ({
      orderNumber: t.order_number ?? String(t.shopify_transaction_id),
      companyName: t.company_name ?? t.customer_name ?? 'Unknown',
      feeAmount: Number(t.fee),
      shopifyFeesAccountId: qboConnection.shopify_fees_account_id!,
    }))

    const journalEntryId = await createJournalEntry({
      payoutDate: payout.payout_date,
      totalFees,
      bankAccountId: qboConnection.bank_account_id!,
      lineItems,
    })

    console.log('[journal] Created:', journalEntryId, '— total fees:', totalFees)
    await db
      .from('payouts')
      .update({
        journal_entry_id: journalEntryId,
        journal_synced_at: new Date().toISOString(),
      })
      .eq('id', payoutId)

    await db.from('sync_log').insert({
      action: 'journal_create',
      payout_id: payoutId,
      status: 'success',
      details: { journal_entry_id: journalEntryId, total_fees: totalFees },
    })

    return NextResponse.json({ journalEntryId })
  } catch (e) {
    console.error('Journal creation error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
